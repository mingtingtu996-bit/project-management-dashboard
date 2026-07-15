// v1.4.13: Reminder preferences service
import { supabase } from './dbService.js'
import { randomUUID } from 'crypto'
import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'

export interface ReminderPreference {
  id?: string
  userId: string
  projectId?: string | null
  companyId?: string | null
  reminderDaysBefore: number
  popupEnabled: boolean
  emailEnabled: boolean
}

export async function getReminderPreference(userId: string, projectId?: string | null, companyId?: string | null) {
  try {
    const result = await rawQuery(
      `
        SELECT *
          FROM public.reminder_preferences
         WHERE user_id = $1
           AND (
             ($2::text IS NOT NULL AND project_id::text = $2::text)
             OR (
               $2::text IS NULL
               AND project_id IS NULL
               AND (
                 ($3::text IS NOT NULL AND company_id::text = $3::text)
                 OR ($3::text IS NULL AND company_id IS NULL)
               )
             )
           )
         ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         LIMIT 1
      `,
      [userId, projectId ?? null, companyId ?? null],
    )
    return result.rows[0] ?? null
  } catch (error) {
    logger.warn('Direct reminder preference read failed, falling back to Supabase', { error })
  }

  let q = (supabase as any).from('reminder_preferences').select('*').eq('user_id', userId)
  if (projectId) q = q.eq('project_id', projectId)
  else {
    q = q.is('project_id', null)
    if (companyId) q = q.eq('company_id', companyId)
    else q = q.is('company_id', null)
  }
  const { data, error } = await q.maybeSingle()
  if (error) { logger.error('Failed to get reminder preference', { error }); return null }
  return data
}

export async function upsertReminderPreference(pref: ReminderPreference) {
  const existing = await getReminderPreference(pref.userId, pref.projectId, pref.companyId)
  const now = new Date().toISOString()
  if (existing) {
    let updateQuery = (supabase as any).from('reminder_preferences').update({
      reminder_days_before: pref.reminderDaysBefore,
      popup_enabled: pref.popupEnabled,
      email_enabled: pref.emailEnabled,
      updated_at: now,
    })
      .eq('id', existing.id)
      .eq('user_id', pref.userId)
    if (pref.projectId) {
      updateQuery = updateQuery.eq('project_id', pref.projectId)
    } else {
      updateQuery = updateQuery.is('project_id', null)
      updateQuery = pref.companyId ? updateQuery.eq('company_id', pref.companyId) : updateQuery.is('company_id', null)
    }
    await updateQuery
  } else {
    await (supabase as any).from('reminder_preferences').insert({
      id: randomUUID(),
      user_id: pref.userId,
      project_id: pref.projectId ?? null,
      company_id: pref.companyId ?? null,
      reminder_days_before: pref.reminderDaysBefore,
      popup_enabled: pref.popupEnabled,
      email_enabled: pref.emailEnabled,
      created_at: now,
      updated_at: now,
    })
  }
}

export async function dismissReminder(userId: string, notificationId: string, sourceEntityType?: string, sourceEntityId?: string) {
  await (supabase as any).from('reminder_dismissals').insert({
    id: randomUUID(),
    user_id: userId,
    notification_id: notificationId,
    source_entity_type: sourceEntityType ?? null,
    source_entity_id: sourceEntityId ?? null,
    created_at: new Date().toISOString(),
  }).catch(() => {})
}
