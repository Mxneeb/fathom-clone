# Synthesizes each seed meeting script (scripts/seed-scripts/*.json) into a single
# WAV file with real Windows SAPI text-to-speech, tracking exact per-line start/end
# timestamps so the seeded transcript is genuinely in sync with the audio — not
# hand-guessed. Silence gaps are inserted between lines for natural pacing.
#
# Usage: powershell -File scripts/synthesize-seed-audio.ps1 [-Only <slug>]
#
# Only three voices ship with Windows (David, Mark, Zira), so a participant can
# also set "rate" (SAPI -10..10) and "pitch" (e.g. 0.9 or 1.1, applied with the
# bundled ffmpeg, tempo preserved) to stay distinguishable in larger meetings.

param([string]$Only = "")

Add-Type -AssemblyName System.Speech

$ErrorActionPreference = "Stop"
$SampleRate = 22050
$BitsPerSample = 16
$Channels = 1
$BytesPerSample = $BitsPerSample / 8
$BytesPerSecond = $SampleRate * $Channels * $BytesPerSample
$GapMs = 350

$root = Split-Path -Parent $PSScriptRoot
$scriptsDir = Join-Path $root "scripts\seed-scripts"
$outDir = Join-Path $root "public\seed-media"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$tmpDir = Join-Path $env:TEMP "fathom-clone-tts"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

function Read-WavPcm16Mono($path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    # Walk the RIFF chunks to the "data" chunk rather than assuming a 44-byte
    # header: ffmpeg's output can carry extra chunks.
    $offset = 12
    while ($offset + 8 -le $bytes.Length) {
        $id = [System.Text.Encoding]::ASCII.GetString($bytes, $offset, 4)
        $size = [System.BitConverter]::ToInt32($bytes, $offset + 4)
        if ($id -eq "data") {
            $size = [Math]::Min($size, $bytes.Length - $offset - 8)
            $dataBytes = New-Object byte[] $size
            [System.Array]::Copy($bytes, $offset + 8, $dataBytes, 0, $size)
            return $dataBytes
        }
        $offset += 8 + $size + ($size % 2)
    }
    throw "No data chunk in $path"
}

$ffmpeg = Join-Path (Split-Path -Parent $PSScriptRoot) "node_modules\ffmpeg-static\ffmpeg.exe"

function Write-WavHeader($stream, $dataLength) {
    $writer = New-Object System.IO.BinaryWriter($stream)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF"))
    $writer.Write([int32](36 + $dataLength))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("WAVE"))
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("fmt "))
    $writer.Write([int32]16)
    $writer.Write([int16]1)               # PCM
    $writer.Write([int16]$Channels)
    $writer.Write([int32]$SampleRate)
    $writer.Write([int32]$BytesPerSecond)
    $writer.Write([int16]($Channels * $BytesPerSample))
    $writer.Write([int16]$BitsPerSample)
    $writer.Write([System.Text.Encoding]::ASCII.GetBytes("data"))
    $writer.Write([int32]$dataLength)
    $writer.Flush()
}

$installedVoices = (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }

function Resolve-VoiceName($shortName) {
    $match = $installedVoices | Where-Object { $_ -like "*$shortName*" } | Select-Object -First 1
    if (-not $match) { throw "No installed voice matches '$shortName'. Installed voices: $($installedVoices -join ', ')" }
    return $match
}

$jsonFiles = Get-ChildItem -Path $scriptsDir -Filter "*.json"
if ($Only) { $jsonFiles = $jsonFiles | Where-Object { $_.BaseName -eq $Only } }

foreach ($jsonFile in $jsonFiles) {
    $meeting = Get-Content $jsonFile.FullName -Raw | ConvertFrom-Json
    Write-Host "Synthesizing: $($meeting.title) ($($meeting.slug))"

    $voiceBySpeaker = @{}
    $rateBySpeaker = @{}
    $pitchBySpeaker = @{}
    foreach ($p in $meeting.participants) {
        $voiceBySpeaker[$p.name] = Resolve-VoiceName $p.voice
        $rateBySpeaker[$p.name] = if ($null -ne $p.rate) { [int]$p.rate } else { 0 }
        $pitchBySpeaker[$p.name] = if ($null -ne $p.pitch) { [double]$p.pitch } else { 1.0 }
    }

    $silenceSamples = [int]([double]$GapMs / 1000.0 * $SampleRate)
    $silenceBytes = New-Object byte[] ($silenceSamples * $Channels * $BytesPerSample)

    $allChunks = New-Object System.Collections.Generic.List[byte[]]
    $timingLines = New-Object System.Collections.Generic.List[object]
    $cursorMs = 0.0

    $lineIndex = 0
    foreach ($line in $meeting.lines) {
        $voice = $voiceBySpeaker[$line.speaker]
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $synth.SelectVoice($voice)
        $synth.Rate = $rateBySpeaker[$line.speaker]

        $lineWavPath = Join-Path $tmpDir "$($meeting.slug)-line-$lineIndex.wav"
        $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
            $SampleRate,
            [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
            [System.Speech.AudioFormat.AudioChannel]::Mono
        )
        $synth.SetOutputToWaveFile($lineWavPath, $format)
        $synth.Speak($line.text)
        $synth.SetOutputToNull()
        $synth.Dispose()

        $pitch = $pitchBySpeaker[$line.speaker]
        if ([Math]::Abs($pitch - 1.0) -gt 0.001) {
            $inv = [string]::Format([Globalization.CultureInfo]::InvariantCulture, "{0:0.####}", 1.0 / $pitch)
            $rate = [string]::Format([Globalization.CultureInfo]::InvariantCulture, "{0:0}", $SampleRate * $pitch)
            $shiftedPath = Join-Path $tmpDir "$($meeting.slug)-line-$lineIndex-shifted.wav"
            & $ffmpeg -y -loglevel error -i $lineWavPath -af "asetrate=$rate,aresample=$SampleRate,atempo=$inv" -ac 1 -ar $SampleRate -c:a pcm_s16le -map_metadata -1 -fflags +bitexact -flags:a +bitexact $shiftedPath
            if ($LASTEXITCODE -ne 0) { throw "ffmpeg pitch shift failed for line $lineIndex" }
            Remove-Item $lineWavPath -ErrorAction SilentlyContinue
            $lineWavPath = $shiftedPath
        }

        $pcm = Read-WavPcm16Mono $lineWavPath
        $durationMs = [double]$pcm.Length / $BytesPerSecond * 1000.0

        $startMs = $cursorMs
        $endMs = $cursorMs + $durationMs

        $timingLines.Add([PSCustomObject]@{
            index     = $lineIndex
            speaker   = $line.speaker
            text      = $line.text
            startMs   = [int][math]::Round($startMs)
            endMs     = [int][math]::Round($endMs)
        })

        $allChunks.Add($pcm)
        $allChunks.Add($silenceBytes)
        $cursorMs = $endMs + ([double]$GapMs)

        Remove-Item $lineWavPath -ErrorAction SilentlyContinue
        $lineIndex++
    }

    $totalDataLength = 0
    foreach ($c in $allChunks) { $totalDataLength += $c.Length }

    $outWavPath = Join-Path $outDir "$($meeting.slug).wav"
    $fs = New-Object System.IO.FileStream($outWavPath, [System.IO.FileMode]::Create)
    Write-WavHeader $fs $totalDataLength
    foreach ($c in $allChunks) { $fs.Write($c, 0, $c.Length) }
    $fs.Close()

    $timingOut = [PSCustomObject]@{
        slug        = $meeting.slug
        title       = $meeting.title
        occurredAt  = $meeting.occurredAt
        participants = $meeting.participants
        totalMs     = [int][math]::Round($cursorMs - $GapMs)
        mediaFile   = "$($meeting.slug).wav"
        lines       = $timingLines
    }
    $timingOutPath = Join-Path $outDir "$($meeting.slug).timing.json"
    $timingOut | ConvertTo-Json -Depth 6 | Set-Content -Path $timingOutPath -Encoding utf8

    Write-Host "  -> $outWavPath ($([math]::Round($cursorMs/1000,1))s)"
    Write-Host "  -> $timingOutPath"
}

Write-Host "Done."
