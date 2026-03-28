[CmdletBinding()]
param(
  [string]$Model = 'claude-opus-4-6',
  [int]$MaxTokens = 1024
)

$ErrorActionPreference = 'Stop'

try {
  Add-Type -AssemblyName System.Net.Http
} catch {
  throw "Failed to load System.Net.Http: $($_.Exception.Message)"
}

try {
  $currentProtocols = [System.Net.ServicePointManager]::SecurityProtocol
  if (($currentProtocols -band [System.Net.SecurityProtocolType]::Tls12) -eq 0) {
    [System.Net.ServicePointManager]::SecurityProtocol = `
      $currentProtocols -bor [System.Net.SecurityProtocolType]::Tls12
  }
} catch {
  # Ignore TLS policy adjustment failures and let the request surface the real error.
}

function Read-GitLabToken {
  $secureToken = Read-Host 'GitLab PAT' -AsSecureString
  $bstr = [System.IntPtr]::Zero

  try {
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [System.IntPtr]::Zero) {
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }

  if ([string]::IsNullOrWhiteSpace($plainToken)) {
    throw 'GitLab PAT is required'
  }

  return $plainToken
}

function Get-DirectAccess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Token
  )

  return Invoke-RestMethod `
    -Method Post `
    -Uri 'https://gitlab.com/api/v4/ai/third_party_agents/direct_access' `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType 'application/json' `
    -Body '{}'
}

function New-ProxyHeaders {
  param(
    [Parameter(Mandatory = $true)]
    [object]$DirectAccess
  )

  $headers = [System.Collections.Generic.Dictionary[string, string]]::new()
  $headers['Authorization'] = "Bearer $($DirectAccess.token)"
  $headers['anthropic-version'] = '2023-06-01'
  $headers['Accept'] = 'text/event-stream'

  foreach ($property in $DirectAccess.headers.PSObject.Properties) {
    $headers[$property.Name] = [string]$property.Value
  }

  return $headers
}

function ConvertTo-ContentBlocks {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  return @{
    type = 'text'
    text = $Text
  }
}

function Invoke-AnthropicStreamingChat {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Token,
    [Parameter(Mandatory = $true)]
    [string]$SelectedModel,
    [Parameter(Mandatory = $true)]
    [int]$TokenLimit,
    [Parameter(Mandatory = $true)]
    [object[]]$ChatMessages
  )

  $directAccess = Get-DirectAccess -Token $Token
  if (-not $directAccess.token -or -not $directAccess.headers) {
    throw 'direct_access response is missing token or headers'
  }

  $headers = New-ProxyHeaders -DirectAccess $directAccess
  $requestBody = @{
    model      = $SelectedModel
    max_tokens = $TokenLimit
    stream     = $true
    messages   = $ChatMessages
  } | ConvertTo-Json -Depth 20

  $handler = [System.Net.Http.HttpClientHandler]::new()
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [System.Threading.Timeout]::InfiniteTimeSpan

  try {
    $request = [System.Net.Http.HttpRequestMessage]::new(
      [System.Net.Http.HttpMethod]::Post,
      'https://cloud.gitlab.com/ai/v1/proxy/anthropic/v1/messages'
    )

    foreach ($key in $headers.Keys) {
      [void]$request.Headers.TryAddWithoutValidation($key, $headers[$key])
    }

    $request.Content = [System.Net.Http.StringContent]::new(
      $requestBody,
      [System.Text.Encoding]::UTF8,
      'application/json'
    )

    $response = $client.SendAsync(
      $request,
      [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
    ).GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
      $errorBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      throw "Proxy request failed: HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)`n$errorBody"
    }

    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $reader = [System.IO.StreamReader]::new($stream)

    $currentEvent = ''
    $dataLines = [System.Collections.Generic.List[string]]::new()
    $assistantText = [System.Text.StringBuilder]::new()

    while (-not $reader.EndOfStream) {
      $line = $reader.ReadLine()

      if ($null -eq $line) {
        continue
      }

      if ($line -eq '') {
        if ($dataLines.Count -gt 0) {
          $payload = $dataLines -join "`n"

          if ($payload -ne '[DONE]') {
            try {
              $json = $payload | ConvertFrom-Json
            } catch {
              $json = $null
            }

            switch ($currentEvent) {
              'content_block_delta' {
                if ($json -and $json.delta -and $json.delta.text) {
                  $text = [string]$json.delta.text
                  Write-Host -NoNewline $text
                  [void]$assistantText.Append($text)
                }
              }
              'error' {
                if ($json) {
                  $errorJson = $json | ConvertTo-Json -Depth 20 -Compress
                  throw "SSE error: $errorJson"
                }
                throw "SSE error: $payload"
              }
            }
          }
        }

        $currentEvent = ''
        $dataLines.Clear()
        continue
      }

      if ($line.StartsWith('event:')) {
        $currentEvent = $line.Substring(6).Trim()
        continue
      }

      if ($line.StartsWith('data:')) {
        $dataLines.Add($line.Substring(5).TrimStart())
      }
    }

    return $assistantText.ToString()
  } finally {
    if ($reader) { $reader.Dispose() }
    if ($stream) { $stream.Dispose() }
    if ($response) { $response.Dispose() }
    if ($request) { $request.Dispose() }
    if ($client) { $client.Dispose() }
    if ($handler) { $handler.Dispose() }
  }
}

$messages = New-Object System.Collections.Generic.List[object]
$GitLabToken = Read-GitLabToken

Write-Host "model: $Model"
Write-Host 'Token loaded.'
Write-Host 'Type a message and press Enter. Use /exit to quit, /clear to reset context.'
Write-Host ''

while ($true) {
  $userInput = Read-Host 'you'

  if ([string]::IsNullOrWhiteSpace($userInput)) {
    continue
  }

  switch ($userInput) {
    '/exit' {
      break
    }
    '/clear' {
      $messages.Clear()
      Write-Host 'Context cleared.'
      Write-Host ''
      continue
    }
  }

  $messages.Add(@{
    role    = 'user'
    content = @((ConvertTo-ContentBlocks -Text $userInput))
  })

  Write-Host ''
  Write-Host -NoNewline 'assistant: '

  try {
    $assistantReply = Invoke-AnthropicStreamingChat `
      -Token $GitLabToken `
      -SelectedModel $Model `
      -TokenLimit $MaxTokens `
      -ChatMessages $messages.ToArray()

    Write-Host ''
    Write-Host ''

    if (-not [string]::IsNullOrWhiteSpace($assistantReply)) {
      $messages.Add(@{
        role    = 'assistant'
        content = @((ConvertTo-ContentBlocks -Text $assistantReply))
      })
    }
  } catch {
    Write-Host ''
    Write-Host ''
    Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red

    if ($messages.Count -gt 0) {
      $messages.RemoveAt($messages.Count - 1)
    }

    Write-Host ''
  }
}
