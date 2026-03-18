# Title

I built an MCP that tells Claude to stop when it's looping on the same error

# Body

Does this happen to you too? Claude hits an error, tries to fix it, same error comes back, tries a slightly different version of the same fix, same error, repeat. By attempt 10 you've lost half an hour and it's still changing import paths.

The root cause is that it has no way to track what it already tried. Earlier attempts leave the context window and it genuinely doesn't know it's going in circles.

I made an MCP server that tracks fix attempts in the background. It fingerprints each error and compares fix descriptions with similarity analysis. If Claude keeps hitting the same error with similar approaches, it gets told to stop and change direction — first gently at attempt 3, more firmly at 5, full stop at 7.

The part that actually makes it work is a rules file in `.claude/rules/` that tells Claude to call the tracking tool after every fix and to obey when it's told to stop. Without that it just ignores it.

It's been saving me a lot of frustration on a project where I kept running into this. Not perfect — sometimes it doesn't call the tool — but when it does it genuinely changes approach instead of trying the same thing again.

Open source if anyone wants to try it or improve it:

```
claude mcp add unloop -s user -- npx -y unloop-mcp
```

https://github.com/protonese3/unloop-mcp

Anyone else found ways to deal with this? I've seen people say "just restart the conversation" but you lose all context that way.
