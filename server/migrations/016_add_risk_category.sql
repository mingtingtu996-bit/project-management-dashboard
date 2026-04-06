-- 为 risks 表添加 risk_category 字段（风险类型：进度/质量/成本/安全/合同/外部/其他）
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_category VARCHAR(20) DEFAULT 'other';

-- 为已有记录推断默认类型（全部设为 other，由用户手动更新）
COMMENT ON COLUMN risks.risk_category IS '风险类型：progress(进度)/quality(质量)/cost(成本)/safety(安全)/contract(合同)/external(外部)/other(其他)';
