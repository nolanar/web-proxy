const http = require('http');
const net = require('net');
const url = require('url');

const HOSTNAME = '127.0.0.1';
const PORT = 3000;

const server = http.createServer();

// HTTP proxy
server.on('request', (req, res) => {
	logRequest(req);

	var req_url = url.parse(req.url);
	var options = {
		hostname: req_url.hostname,
		path: req_url.path,
		method: req.method,
		headers: req.headers
	};
	var proxy_req = http.request(options, (proxy_res) => {
  		res.writeHead(proxy_res.statusCode, proxy_res.headers);
		proxy_res.pipe(res);
	});
	req.pipe(proxy_req);
});

// HTTPS/TCP proxy
// using HTTP CONNECT tunneling
server.on('connect', (req, socket, head) => {
	logRequest(req);

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
	});
});

server.listen(PORT, HOSTNAME, () => {
 	console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});

function logRequest (req) {
	console.log(`${req.method} ${req.url}`);
}