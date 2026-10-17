# Lyra shell integration for fish.
# Emits OSC 133 lifecycle markers, OSC 7 cwd updates, and Lyra OSC prompt markers.

if set -q LYRA_SHELL_INTEGRATION_DISABLED; or set -q __LYRA_FISH_INTEGRATION
    return 0
end

set -g __LYRA_FISH_INTEGRATION 1
set -g __lyra_fish_command_running 0

function __lyra_osc
    printf '\e]%s\a' "$argv[1]"
end

function __lyra_url_escape
    string replace -a '%' '%25' -- "$argv[1]" | string replace -a ' ' '%20' | string replace -a '#' '%23' | string replace -a '?' '%3F'
end

function __lyra_emit_cwd
    set -l host (hostname 2>/dev/null)
    if test -z "$host"
        set host localhost
    end
    set -l escaped (__lyra_url_escape "$PWD")
    __lyra_osc "7;file://$host$escaped"
    __lyra_osc "633;Cwd;$escaped"
end

function __lyra_preexec --on-event fish_preexec
    set -l command "$argv"
    __lyra_osc '133;B'
    if set -q LYRA_NEXT_COMMAND_ID
        __lyra_osc "633;CommandId;"(__lyra_url_escape "$LYRA_NEXT_COMMAND_ID")
    end
    __lyra_osc "133;C;command="(__lyra_url_escape "$command")
    if set -q LYRA_NEXT_COMMAND_ID
        __lyra_osc "633;CommandStart;commandId="(__lyra_url_escape "$LYRA_NEXT_COMMAND_ID")";command="(__lyra_url_escape "$command")
        set -e LYRA_NEXT_COMMAND_ID
    end
    set -g __lyra_fish_command_running 1
end

function __lyra_postexec --on-event fish_postexec
    # fish 4.x forbids re-assigning the special `status` variable
    # ("Tried to modify the special variable 'status' with the wrong scope"),
    # which printed an error into the PTY after every command. Capture the
    # exit status into a differently-named local instead; expansion happens
    # before `set` runs, so the first read is still the command's status.
    set -l exit_status $status
    if test "$__lyra_fish_command_running" = 1
        __lyra_osc "133;D;$exit_status"
        __lyra_osc "633;CommandEnd;exitCode=$exit_status"
        set -g __lyra_fish_command_running 0
    end
end

function __lyra_prompt --on-event fish_prompt
    __lyra_emit_cwd
    __lyra_osc '133;A'
    __lyra_osc '633;LyraPrompt'
end

if set -q LYRA_OPEN_URL_BIN
    set -l __lyra_open_dir (dirname -- "$LYRA_OPEN_URL_BIN")
    if not contains -- $__lyra_open_dir $PATH
        set -gx PATH $__lyra_open_dir $PATH
    end
end
