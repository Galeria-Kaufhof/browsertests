mkdir -p sslcert
openssl req -x509 -nodes -newkey rsa:4096 -keyout sslcert/server.key.pem -out sslcert/server.cert.pem -days XXX