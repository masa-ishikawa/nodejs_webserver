
var HTTP = require("http");
var URL = require("url");
const COMMON = require("oci-common");
const OS = require("oci-objectstorage");

const mime = {
	"m3u8": "application/x-mpegurl",
	"fmp4": "application/octet-stream",
};

function getContentType(fname) {
	var ext = "";
	var pos = fname.lastIndexOf(".");
	if (pos >= 0) {
		ext = fname.substring(pos + 1);
	}
	ext = ext.toLowerCase();
	var ctype = mime[ext];
	if (ctype == undefined) {
		return ("text/plain");
	}
	return (ctype);
}

var simpleAuth = true;
var provider;
if (!simpleAuth)
	provider = new COMMON.ConfigFileAuthenticationDetailsProvider();
else {
	const tenancy = "<your-tenancy-id>";
	const user = "<your-user-id>";
	const fingerprint = "<your-fingerprint>";
	const passphrase = null;
	const privateKey = `<your-private-key>`;
	const region = COMMON.Region.AP_TOKYO_1;	//your bucket region
	provider = new COMMON.SimpleAuthenticationDetailsProvider(
		tenancy,
		user,
		fingerprint,
		privateKey,
		passphrase,
		region
	);
}

const client = new OS.ObjectStorageClient({
	authenticationDetailsProvider: provider
});

var server = HTTP.createServer();
server.on("request",
	function (request, response) {
		(async () => {
			var ReqUrl = URL.parse(decodeURI(request.url), true);
			var targetFile = ReqUrl.pathname.substring(1);

			var code = Math.random().toString(32).substring(2);
			console.log("--------");
			console.log(targetFile + ":" + code);

			const treq = {};
			const tres = await client.getNamespace(treq);
			const namespace = tres.value;

			const getObjectRequest = {
				objectName: "output/" + targetFile,	//target data path
				bucketName: "<your-bucket-name>",	//taraget bucket
				namespaceName: namespace
			};


			try {
				const getObjectResponse = await client.getObject(getObjectRequest);
				var contentType = getContentType(targetFile);
				var total = getObjectResponse.contentLength;
				var range = request.headers.range;
				if (range) {
					var parts = range.replace(/bytes=/, "").split("-");
					var partialstart = parts[0];
					var partialend = parts[1];

					var start = parseInt(partialstart, 10);
					var end = partialend ? parseInt(partialend, 10) : total;
					var rangeSize = (end - start) + 1;

					response.writeHead(206, {
						'Access-Control-Allow-Origin': '*',
						"Content-Type": contentType,
						"Content-Length": rangeSize,
						"Content-Range": "bytes " + start + "-" + end + "/" + total,
					});
					await writeChunk(getObjectResponse, start, end);

				} else {
					response.writeHead(200, {
						'Access-Control-Allow-Origin': '*',
						"Content-Type": contentType,
						"Content-Length": total,
					});
					await writeChunk(getObjectResponse);
				}
				response.end();
				console.log("response ended:" + code);

			} catch (err) {
				// console.log(err.stack);
				response.writeHead(200, {
					'Access-Control-Allow-Origin': '*',
					"Content-Type": "text/html"
				});
				response.write("Please sepecify .m3u8 file on bucket.");
				response.end();

			} finally {
			}

			async function writeChunk(getObjectResponse, start, end) {
				console.log("start:" + start + ",end:" + end);
				var cs = 0;
				var ce = 0;
				var reader = await getObjectResponse.value.getReader();
				var clengh;
				async function readChunk({ done, value }) {
					if (done) {
						return;
					}
					if (start !== undefined && end !== undefined) {
						clengh = value.length;
						ce += clengh;
						if (ce > start && cs < end) {
							if (start >= cs && ce >= start) {
								value = value.slice((start - cs), Math.min(ce, end) + 1);
							} else if (end >= cs && ce >= end) {
								value = value.slice(0, (end - cs) + 1);
							} else {
								// value = value.slice(0, value.length);
							}
							response.write(value);
						}
						cs += clengh;
						if (ce >= end) {
							return;
						}
					} else {
						response.write(value);
					}
					reader.read().then(readChunk);
					await reader.read().then(readChunk);
				}
				await reader.read().then(readChunk);
				reader.read().then(readChunk);
			}
		})();

	}
);

const IP = "127.0.0.1";
const PORT = 8080;
server.listen(PORT, IP);
console.log('[WebServer] http://' + IP + ':' + PORT);