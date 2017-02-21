const http = require('http');
const net = require('net');
const url = require('url');
const crypto = require('crypto');
const fs = require('fs');
const readline = require('readline');
const util = require('util');

const HOSTNAME = '127.0.0.1';
const PORT = 3000;

const cachedir = 'cache';
const cachepath = __dirname + '/' + cachedir;

//// initialisation ////

// create cache directory if it does not exist
if (!fs.existsSync(cachepath)){
    fs.mkdirSync(cachepath);
}

//// Proxy Server ////

const proxy = http.createServer();

/* HTTP proxy
 */
proxy.on('request', (req, res) => {
	logRequest(req);

	// check if host or URL is being blocked
	if (urlIsBlocked(req)) {
		console.log('url blocked');
		res.statusCode = 403; // 403 Forbidden
		res.end('<h1>403 Forbidden</h1><p>URL blocked</p>');
		return;
	}

	// if request is cached and a GET request
	// then insert etag, 'last-modified' headers into request header
	var getCached = (req.method === 'GET') && isCached(req.url);
	if (getCached) {
		var tag = getTag(req.url);
		for (var prop in tag) {
			req.headers[prop] = tag[prop];
		}
		console.log('page cached');
	} else if (req.method === 'GET') {
		console.log('page not cached');
	}

	var req_url = url.parse(req.url);
	var options = {
		hostname: req_url.hostname,
		path: req_url.path,
		method: req.method,
		headers: req.headers
	};
	var proxy_req = http.request(options, (proxy_res) => {

		console.log("server response:", proxy_res.statusCode);

		// if there is a cached page and received 'not modified' status
		// then respond with '200 OK' and the cached page
		if (getCached && proxy_res.statusCode === 304) {
			console.log("serving from proxy cache");
			// read cached headers
			var headers;
			fs.readFile(cacheHead(req.url), (err, data) => {
				if (err) throw err;
				headers = JSON.parse(data);

				res.writeHead('200', headers);
				
				// pipe file containing cached page to client response
				var cached_page = fs.createReadStream(cacheContent(req.url));
				cached_page.on('open', () => {
					cached_page.pipe(res);
				});
			});
		} else {
			console.log("not serving from proxy cache");
			// if response is '200 OK' then cache the page
			if (proxy_res.statusCode === 200) {
				if (addTag(req.url, proxy_res.headers)) {
					console.log("caching page");
					// cache page headers
					var headers_string = JSON.stringify(proxy_res.headers);
					fs.writeFile(cacheHead(req.url), headers_string, (err) => {
						if (err) throw err;
					});

					// cache page content
					var cached_body = fs.createWriteStream(cacheContent(req.url));
					cached_body.on('error', (err) => {
						console.error(err);
					});
					proxy_res.pipe(cached_body);
				}
			}

	  		res.writeHead(proxy_res.statusCode, proxy_res.headers);
			proxy_res.pipe(res);
		}
	});
	req.pipe(proxy_req);
});

/* HTTPS/TCP proxy
 * using HTTP CONNECT tunneling
 */
proxy.on('connect', (req, socket, head) => {
	logRequest(req);

	// check if host or URL is being blocked
	if (hostIsBlocked(req)) {
		socket.end(`HTTP/${req.httpVersion} 403 Connection forbidden\r\n\r\n`);
		console.log("hostname blocked");
		return;
	}

	var proxySocket = new net.Socket();
	var host_port = req.url.split(':');
	var options = {
		host: host_port[0],
		port: host_port[1]
	};
	proxySocket.connect(options, () => {
		socket.write(`HTTP/${req.httpVersion} 200 Connection established\r\n\r\n`); // connection success response
		console.log("connection established");
		proxySocket.write(head);
		proxySocket.pipe(socket).pipe(proxySocket);
	}).on('error', (err) => {
		console.error(err.stack);
	});
});

proxy.listen(PORT, HOSTNAME, () => {
 	console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});

function logRequest (req) {
	console.log(`\n${req.method} ${req.url}`);
}


//// Blacklist ////

var blocked_hosts = new Set();
var blocked_urls = new Set();

function urlIsBlocked(req) {
	return blocked_hosts.has(req.headers['host'])
		|| blocked_urls.has(req.url);
}

function hostIsBlocked(req) {
	var hostname = req.url.split(':')[0];
	return blocked_hosts.has(hostname);
}

function blockUrl(urlString) {
	blocked_urls.add(urlString);
}

function blockHost(hostString) {
	blocked_hosts.add(hostString);
}

function unblockUrl(urlString) {
	return blocked_urls.delete(urlString);
}

function unblockHost(hostString) {
	return blocked_hosts.delete(hostString);
}

function printBlockedHosts() {
	if (blocked_hosts.size === 0) console.log('none');
	for (let item of blocked_hosts) console.log(item);
}

function printBlockedUrls() {
	if (blocked_urls.size === 0) console.log('none');
	for (let item of blocked_urls) console.log(item);
}

//// Cache ////

var tag_cache = new Map();

function isCached(url) {
	return tag_cache.has(url);
}

function urlId(url) {
	return md5(url);
}

function cacheHead(url) {
	return __dirname + '/' + cachedir + '/' + urlId(url) + '-h';
}

function cacheContent(url) {
	return __dirname + '/' + cachedir + '/' + urlId(url) + '-c';
}

function addTag(url, headers) {
	var tag = {};
	if (headers.hasOwnProperty('etag')) {
		tag.etag = headers.etag;
	}
	if (headers.hasOwnProperty('last-modified')) {
		tag['last-modified'] = headers['last-modified'];
	}

	if (Object.keys(tag).length !== 0) {
		tag_cache.set(url, tag);
		return true;
	}
	return false;
}

function getTag(url) {
	return tag_cache.get(urlId(url));
}

function printCache() {
	if (tag_cache.size === 0) console.log('empty');
	for (let url of tag_cache.keys()) console.log(url);
}

function uncache(url) {
	return tag_cache.delete(url);
}

function clearCache() {
	tag_cache.clear();
}

//// utility functions ////

/* Return MD5 hash of input data
 *
 * used for hashing urls to simplify filenaming and map keys
 */
function md5(data) {
	return crypto.createHash('md5').update(data).digest('hex');
}

//// CLI prompt ////

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});
rl.setPrompt(">> ");

rl.on('line', (line) => {
	
	var input = line.trim().split(/\s+/);
	var command = input[0];

	switch(command) {
	case 'blacklist':
		console.log('Blacklisted hosts:');
		printBlockedHosts();
		console.log('Blacklisted URLs:');
		printBlockedUrls();
		break;
	case 'blockurl':
		if (input.length === 2) blockUrl(input[1]);
		else console.log(`invalid input: one argument expected`);
		break;
	case 'blockhost':
		if (input.length === 2) blockHost(input[1]);
		else console.log(`invalid input: one argument expected`);
		break;
	case 'unblockurl':
		if (input.length === 2 && !unblockUrl(input[1])) {
			console.log("warning: no matching url found: nothing removed");
		}
		else console.log(`invalid input: one argument expected`);
		break;
	case 'unblockhost':
		if (input.length === 2 && !unblockHost(input[1])) {
			console.log("warning: no matching hostname found: nothing removed");			
		}
		else console.log(`invalid input: one argument expected`);
		break;
	case 'cache':
		printCache();
		break;
	case 'uncache':
		if (input.length === 2 && !uncache(input[1])) {
			console.log("warning: no matching url found: nothing removed");
		}
		else console.log(`invalid input: one argument expected`);
		break;
	case 'clearcache':
		clearCache();
		break;
	default: 
		console.log('invalid command');
	}

	// fixes bug with prompt characters not displaying after some commands
	rl._refreshLine();

}).on('close', () => {
    return process.exit(1);
});

// modify console.log so that output does not spill onto input
var log = console.log;
console.log = function() {
    rl.output.write('\x1b[2K\r');
    log.apply(console, Array.prototype.slice.call(arguments));
    rl._refreshLine();
}