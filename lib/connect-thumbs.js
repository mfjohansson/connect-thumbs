if (!module.parent) {
    console.log("Please don't call me directly. I am just the main app's minion.");
    process.exit(1);
}

// example:
// http://example.com/thumbs/small/images/hashcode.jpeg

var options = {}, ttl, tmpDir, presets, decodeFn, regexp = '';

var mkdirp = require('mkdirp'),
    request = require('request'),
    im = require('imagemagick'),
    path = require('path'),
    fs = require('fs'),
    send = require('send'),
    crypto = require('crypto');

// @TODO: make imagemagick configurable in case paths are not defaults
// (maybe they can pass-in the imagemagick instance they want to use)

exports = module.exports = function thumbs(opts) {

    opts = opts || {};
    parseOptions(opts);

    return function thumbs(req, res, next) {

        if ('GET' != req.method && 'HEAD' != req.method) return next();

        function resume(runNext) {
            if (runNext) next();
        }

        var thumbRequestParts = req.originalUrl.match(regexp);
        if (!thumbRequestParts) {
            return resume(true);
        }

        var imagePreset = thumbRequestParts[1];

        if (!presets[imagePreset]) { //non-existent preset requested.
            res.writeHead(400);
            res.end('Invalid Preset')
            return resume(false);
        }

        //console.log("Started thumbnailing: " + req.originalUrl);

        var encodedImageURL = thumbRequestParts[2];

        // Pre-declare variables that will be initialized in the decoder closure
        var filepath, fileStream, modifiedFilePath, preset;

        decodeFn(encodedImageURL, function imageURLDecoding(err, decodedImageURL) {

            //-- Start creating and serving a thumbnail
            var targetDir = tmpDir + '/' + imagePreset;
            mkdirp.sync(targetDir); // Make sure tmp directory exists.

            var ext = path.extname(decodedImageURL);

            var hashedName = hash(decodedImageURL); // This is to be safe, in case somebody uses risky encodeFn

            preset = presets[imagePreset];
            filepath = targetDir + '/' + hashedName + ext;
            modifiedFilePath = targetDir + '/' + hashedName + "-" + imagePreset + ext;


            fileStream = fs.createWriteStream(filepath);
            request.get(decodedImageURL).pipe(fileStream);

            fileStream.on("close", function sendFileAfterTransform() {

                modifyImage({
                    filepath: filepath,
                    dstPath: modifiedFilePath,
                    preset: preset
                }, function(err) {
                    if (err) {
                        res.send(404);
                        return resume(false);
                    }

                    //console.log("SENDING: " + req.originalUrl);
                    send(req, modifiedFilePath)
                        .maxage(ttl || 0)
                        .pipe(res);

                    return resume(false);
                });

            });

        });

    };

};

exports.decodeURL = function(encodedURL, callback) {
    callback(null, new Buffer(encodedURL, 'base64').toString('ascii'));
}

/**
 * Return cryptographic hash (defaulting to: "sha1") of a string.
 *
 * @param {String} str
 * @param {String} algo - Algorithm used for hashing, defaults to sha1
 * @param {String} encoding - defaults to hex
 * @return {String}
 */
var hash = function(str, algo, encoding) {
    return crypto
        .createHash(algo || 'sha1')
        .update(str)
        .digest(encoding || 'hex');
}

var parseOptions = function(options) {

    ttl = options.ttl || (3600 * 24); // cache for 1 day by default.
    decodeFn = options.decodeFn || exports.decodeURL;
    presets = options.presets || defaultPresets();

    tmpDir = options.tmpDir || '/tmp/nodethumbnails';

    var rootPath = options.rootPath || '/thumbs';
    if (rootPath[0] === '/') {
        rootPath = rootPath.substring(1);
    } // be forgiving to user errors!

    var allowedExtensions = options.allowedExtensions || ['gif', 'png', 'jpg', 'jpeg'];
    for (i = 0; i < allowedExtensions.length; i++) {
        // be forgiving to user errors!
        if (allowedExtensions[i][0] === '.') {
            allowedExtensions[i] = allowedExtensions[i].substring(1);
        }
    }
    var szExtensions = allowedExtensions.join('|')

    // Example: http://example.com/thumbs/small/images/AB23DC16Hash.jpg
    regexp = new RegExp('^\/' + rootPath.replace(/\//ig, '\\/') +
        '\/([A-Za-z0-9_]+)\/images\/([%\.\-A-Za-z0-9_=\+]+)\.(?:' + szExtensions + ')$', 'i');
}

var defaultPresets = function() {

    return {
        small: {
            width: 120,
            compression: .5
        },
        medium: {
            width: 300,
            compression: .7
        },
        large: {
            width: 900,
            compression: .85
        }
    }

}

var modifyImage = function(options, callback) {

    try {
        im.identify([options.filepath], function(err, stdout) {
            if (err) {
                callback(err);
                return;
            }

            var dim = options.preset.width + 'x' + (options.preset.height || options.preset.width); //+ '^';
            var crop = options.preset.width + 'x' + options.preset.width + '+0+0';

            var args = [
                options.filepath,
                '-resize', dim,
                //'-crop', crop,
                //'xc:white', '+swap',
                //'-gravity', 'center',
                options.dstPath
            ];

            im.convert(args, function(err, stdout) {
                callback(err);
            });

        });

    } catch (err) {
        callback(err);
    }
}