-- This script switches between normal and meeting audio setups

on run argv
    set mode to ""
    if (count of argv) > 0 then
        set mode to item 1 of argv
    end if
    
    -- Get current audio devices using SwitchAudioSource
    set currentInput to getCurrentInputDevice()
    set currentOutput to getCurrentOutputDevice()
    
    log "Current Input: " & currentInput
    log "Current Output: " & currentOutput
    
    -- Determine what to do based on mode or current state
    if mode is "meeting" then
        switchToMeetingMode()
    else if mode is "normal" then
        switchToNormalMode()
    else
        -- Auto-toggle based on current state
        if currentInput contains "Aggregate" or currentOutput contains "Multi-Output" then
            log "Switching from Meeting Mode to Normal Mode"
            switchToNormalMode()
        else
            log "Switching from Normal Mode to Meeting Mode"
            switchToMeetingMode()
        end if
    end if
end run

-- Switch to Meeting Mode (Aggregate + Multi-Output)
on switchToMeetingMode()
    try
        log "🔄 Switching to Meeting Mode..."
        
        -- Use SwitchAudioSource to change devices
        do shell script "SwitchAudioSource -t input -s \"Aggregate Device\""
        do shell script "SwitchAudioSource -t output -s \"Multi-Output Device 1\""
        
        log "✅ Switched to Meeting Mode successfully"
        
        -- Display notification
        display notification "Meeting audio active! System + Mic capture enabled." with title "personal Cluely" sound name "Glass"
        
    on error errorMessage
        log "❌ Error switching to meeting mode: " & errorMessage
        display notification "Failed to switch to meeting mode: " & errorMessage with title "personal Cluely" sound name "Basso"
        error errorMessage
    end try
end switchToMeetingMode

-- Switch to Normal Mode (Built-in devices)
on switchToNormalMode()
    try
        log "🔄 Switching to Normal Mode..."
        
        -- Use SwitchAudioSource to change devices
        do shell script "SwitchAudioSource -t input -s \"MacBook Air Microphone\""
        do shell script "SwitchAudioSource -t output -s \"MacBook Air Speakers\""
        
        log "✅ Switched to Normal Mode successfully"
        
        -- Display notification
        display notification "Normal audio restored. Back to built-in devices." with title "personal Cluely" sound name "Glass"
        
    on error errorMessage
        log "❌ Error switching to normal mode: " & errorMessage
        display notification "Failed to switch to normal mode: " & errorMessage with title "personal Cluely" sound name "Basso"
        error errorMessage
    end try
end switchToNormalMode

-- Get current input device
on getCurrentInputDevice()
    try
        set inputDevice to do shell script "SwitchAudioSource -t input -c"
        return inputDevice
    on error
        return "Unknown"
    end try
end getCurrentInputDevice

-- Get current output device
on getCurrentOutputDevice()
    try
        set outputDevice to do shell script "SwitchAudioSource -t output -c"
        return outputDevice
    on error
        return "Unknown"
    end try
end getCurrentOutputDevice 