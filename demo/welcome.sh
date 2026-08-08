#!/bin/sh
# Prints a redacted replica of the Claude Code welcome screen for the
# demo recording. The real binary can't run here (auth is bound to real
# config dirs), and a real recording would show name/org/billing.
# $1: version to show in the border, $2: cwd to show under the model.

VER=${1:-2.x.x}
CWD=${2:-~/dev/personal/blog}

C=$(printf '\033[38;2;222;119;95m')   # coral
B=$(printf '\033[1m')
D=$(printf '\033[2m')
I=$(printf '\033[3m')
R=$(printf '\033[0m')

echo
printf "%s╭─%s Claude Code v%s %s───────────────────┬──────────────────────────╮%s\n" "$C" "$R$D" "$VER" "$C" "$R"
printf "%s│%s                                          %s│%s %s%sTips for getting started%s %s│%s\n" "$C" "$R" "$C" "$R" "$C" "$B" "$R" "$C" "$R"
printf "%s│%s             %sWelcome back!%s                %s│%s %sAsk Claude to create a…%s  %s│%s\n" "$C" "$R" "$B" "$R" "$C" "$R" "$D" "$R" "$C" "$R"
printf "%s│%s                                          %s│%s                          %s│%s\n" "$C" "$R" "$C" "$R" "$C" "$R"
printf "%s│%s               %s█▀▄▄▄▄▀█%s                   %s│%s %s%sWhat's new%s               %s│%s\n" "$C" "$R" "$C" "$R" "$C" "$R" "$C" "$B" "$R" "$C" "$R"
printf "%s│%s               %s████████%s                   %s│%s %sBug fixes and reliabil…%s  %s│%s\n" "$C" "$R" "$C" "$R" "$C" "$R" "$D" "$R" "$C" "$R"
printf "%s│%s               %s▀█▀██▀█▀%s                   %s│%s %sAdded gateway spend li…%s  %s│%s\n" "$C" "$R" "$C" "$R" "$C" "$R" "$D" "$R" "$C" "$R"
printf "%s│%s                                          %s│%s %sAdded a workspace trus…%s  %s│%s\n" "$C" "$R" "$C" "$R" "$D" "$R" "$C" "$R"
printf "%s│%s                %sFable 5%s                   %s│%s %s%s/release-notes for more%s  %s│%s\n" "$C" "$R" "$D" "$R" "$C" "$R" "$D" "$I" "$R" "$C" "$R"
printf "%s│%s      %s%-36s%s%s│%s                          %s│%s\n" "$C" "$R" "$D" "$CWD" "$R" "$C" "$R" "$C" "$R"
printf "%s╰──────────────────────────────────────────┴──────────────────────────╯%s\n" "$C" "$R"
echo
printf "                                                  %s● high · /effort%s\n" "$D" "$R"
printf "%s──────────────────────────────────────────────────────────────────────%s\n" "$D" "$R"
printf "%s❯%s %sTry \"write a test for <filepath>\"%s\n" "$C" "$R" "$D" "$R"
printf "%s──────────────────────────────────────────────────────────────────────%s\n" "$D" "$R"
printf "  %s? for shortcuts%s\n" "$D" "$R"
