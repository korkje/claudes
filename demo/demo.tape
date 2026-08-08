# Regenerate the README demo: npm run build && vhs demo/demo.tape
Output demo/demo.gif

Set FontSize 18
Set Width 880
Set Height 520
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 75ms

Hide
Type `. demo/setup.sh && cd "$HOME" && clear`
Enter
Sleep 2s
Show

# create two accounts
Type "claudes"
Sleep 500ms
Enter
Sleep 1.5s
Down
Sleep 500ms
Enter
Sleep 800ms
Type "personal"
Sleep 400ms
Enter
Sleep 1.2s
Down
Sleep 500ms
Enter
Sleep 800ms
Type "work"
Sleep 400ms
Enter
Sleep 1.2s

# map a directory to each account (p expands, "+ add path" adds inline)
Up
Sleep 500ms
Type "p"
Sleep 1s
Down
Sleep 500ms
Enter
Sleep 1s
Type "/dev/personal"
Sleep 400ms
Enter
Sleep 1.5s
Down
Sleep 400ms
Down
Sleep 400ms
Type "p"
Sleep 1s
Down
Sleep 500ms
Enter
Sleep 1s
Type "/dev/work"
Sleep 400ms
Enter
Sleep 1.5s
Sleep 1s
Escape
Sleep 1s

# a mapped directory launches its account by itself
Type "cd ~/dev/personal/blog"
Sleep 300ms
Enter
Sleep 800ms
Type "claudes"
Sleep 300ms
Enter
Sleep 5s
Sleep 6s
