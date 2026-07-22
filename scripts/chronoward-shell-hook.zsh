# ChronoWard ZSH Shell Integration Hook
# Automatically logs terminal command executions to ChronoWard local storage with enterprise secret redaction.

_chronoward_sanitize_cmd() {
    local raw_cmd="$1"
    # Redact Bearer tokens, passwords, API keys, and sensitive CLI flags
    local sanitized="$raw_cmd"
    sanitized=$(echo "$sanitized" | sed -E 's/(Bearer|token|password|passwd|secret|api_key|apikey)[=:]+[^ ]+/\1=[REDACTED]/gi')
    sanitized=$(echo "$sanitized" | sed -E 's/(-p|--password|--token|--secret|--api-key)[ ]+[^ ]+/\1 [REDACTED]/gi')
    echo "$sanitized"
}

_chronoward_preexec() {
    _CHRONO_CMD="$1"
    _CHRONO_START_TIME=$(( ${EPOCHREALTIME%.*} * 1000 ))
}

_chronoward_precmd() {
    local exit_code=$?
    if [[ -n "$_CHRONO_START_TIME" ]]; then
        local end_time=$(( ${EPOCHREALTIME%.*} * 1000 ))
        local duration=$((end_time - _CHRONO_START_TIME))
        
        # Only log commands running longer than 3 seconds to prevent terminal noise
        if [ $duration -gt 3000 ]; then
            local clean_cmd
            clean_cmd=$(_chronoward_sanitize_cmd "$_CHRONO_CMD")
            chronoward log --project "Terminal" --task "$clean_cmd" --hours 0.1 >/dev/null 2>&1 &
        fi
        unset _CHRONO_START_TIME
    fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _chronoward_preexec
add-zsh-hook precmd _chronoward_precmd
