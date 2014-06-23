var thumbs = require('./index.js');
var connect = require('connect');
var http = require('http');

var app = connect()
    .use(connect.logger('dev'))
    .use(thumbs({
        "ttl": 7200,
        "allowedExtensions": ['png', 'jpg', 'jpeg'],
        "presets": {
            small: {
                width: 120,
                height: 120,
                compression: .5
            },
            medium: {
                width: 300,
                height: 300,
                compression: .7
            },
            large: {
                width: 900,
                height: 900,
                compression: .85
            },
            thin: {
                width: 800,
                height: 400,
                compression: .85
            },
            long: {
                width: 400,
                height: 800,
                compression: .85
            }
        }
    }))

http.createServer(app).listen(3000);