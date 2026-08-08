# Regenerate the README demo: npm run build && vhs demo/demo.tape
Output demo/demo.gif

Set FontSize 20
Set Width 960
Set Height 560
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 75ms

Hide
Type ". demo/setup.sh && clear"
Enter
Sleep 2s
Show

# scene 1: create an account and launch it
Type "claudes"
Sleep 500ms
Enter
Sleep 1.5s
Down
Sleep 800ms
Enter
Sleep 1s
Type "personal"
Sleep 500ms
Enter
Sleep 1.5s
Enter
Sleep 2s

# scene 2: a mapped directory picks its account by itself
Type "cd ~/dev/personal/blog"
Sleep 300ms
Enter
Sleep 800ms
Type "claudes"
Sleep 300ms
Enter
Sleep 5.5s
Sleep 1.5s
