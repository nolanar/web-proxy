# Web Proxy
A web proxy written in Node.js

## Features
* HTTP, HTTPS and TCP proxy support
* URL and hostname blacklisting
* HTTP GET response caching

## Managemet Console Commands
* `blacklist`  - Print all the blacklisted URLs and hostnames
* `blockurl [URL]` - Block the specified URL
* `blockhost [hostname]` - Block the specified hostname
* `unblockurl [URL]` - Unblock the specified URL
* `unblockhost [hostname]` - Unblock the specified hostname
* `cache` - List all cached URLs
* `uncache [URL]` - Un-cache the specified URL
* `clearcache` - Clear all URLs from the cache
