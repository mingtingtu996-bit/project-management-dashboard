$ProgressPreference = 'SilentlyContinue'

$urls = @(
  'http://127.0.0.1:3001/api/health',
  'http://127.0.0.1:3001/api/jobs',
  'http://127.0.0.1:3001/api/projects',
  'http://127.0.0.1:3001/api/dashboard/projects-summary',
  'http://127.0.0.1:3001/api/notifications',
  'http://127.0.0.1:3001/api/notifications/unread'
)

$results = @()

foreach ($url in $urls) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 12
    $sw.Stop()
    $results += [pscustomobject]@{
      url        = $url
      status     = [int]$response.StatusCode
      elapsed_ms = $sw.ElapsedMilliseconds
      body       = $response.Content.Substring(0, [Math]::Min(240, $response.Content.Length))
    }
  } catch {
    $sw.Stop()
    $results += [pscustomobject]@{
      url        = $url
      status     = $null
      elapsed_ms = $sw.ElapsedMilliseconds
      error      = $_.Exception.Message
    }
  }
}

$results | ConvertTo-Json -Depth 4
