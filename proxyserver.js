const http = require('http');
const net = require('net');
const url = require('url');

const HOSTNAME = '127.0.0.1';
const PORT = 3000;

//// Proxy Server ////

const proxy = http.createServer();

/* HTTP proxy
 */
proxy.on('request', (req, res) => {
	logRequest(req);

	// check if host or URL is being blocked
	if (urlIsBlocked(req)) {
		res.statusCode = 403; // 403 Forbidden
		res.end('<h1>403 Forbidden</h1><p>URL blocked</p>');
		return;
	}

	console.log("REQUEST", req.headers);

	var req_url = url.parse(req.url);
	var options = {
		hostname: req_url.hostname,
		path: req_url.path,
		method: req.method,
		headers: req.headers
	};
	var proxy_req = http.request(options, (proxy_res) => {
		console.log("RESPONSE:", proxy_res.statusCode);
		console.log(proxy_res.headers);
  		res.writeHead(proxy_res.statusCode, proxy_res.headers);
		proxy_res.pipe(res);
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
	console.log(`${req.method} ${req.url}`);
}


//// Blacklisting ////

var blocked_hosts = new Set();
var blocked_urls = new Set();

function urlIsBlocked(req) {
	console.log(req.url, req.headers['host']);
	return blocked_hosts.has(req.headers['host'])
		|| blocked_urls.has(req.url);
}

function hostIsBlocked(req) {
	var hostname = req.url.split(':')[0];
	return blocked_hosts.has(hostname);
}

function blockUrl(urlString) {
	//TODO: validate and parse url string
	blocked_urls.add(urlString);
}

function blockHost(hostString) {
	//TODO: validate and parse host string
	blocked_urls.add(hostString);
}