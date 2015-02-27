'use strict';

var through = require('through2'),
    glob = require('glob'),
    path = require('path'),
    fs = require('fs');

var placeholders = {
    'js': '<script src="{{filename}}"></script>',
    'css': '<link rel="stylesheet" href="{{filename}}">'
};

var regex = /(([ \t]*)<!--\s*include:([a-z]+)\(([^)]+)\)\s*-->)(\n|\r|.)*?(<!--\s*endinclude\s*-->)/gi;

function parseFiles(source, cwd) {

    if (source.indexOf('list:') === 0) {
        var cleanSrc = source.replace('list:', '');
        return fs.readFileSync(cleanSrc).toString().split('\n');
    }

    return glob.sync(source, {
        cwd: cwd
    });
}

function replaceIncludes(contents, options) {
    var cwd = options.cwd || process.cwd();

    return contents.replace(regex, function(match, startBlock, spacing, blockType, fileGlob, oldScripts, endBlock, offset, string) {
        var placeholder = placeholders[blockType];
        var files = parseFiles(fileGlob, cwd);

        var includes = spacing + files.map(function(filename) {
            return placeholder.replace('{{filename}}', filename);
        }).join('\n' + spacing);

        var result = '';
        if (!options['remove-comments']) {
            result += startBlock + '\n';
        }
        result += includes;
        if (!options['remove-comments']) {
            result += '\n' + spacing + endBlock;
        }
        return result;
    });
}

var includeSource = function(opts) {
    var src = [];
    var streams = [];
    var srcArr = Array.isArray(opts.src) ? opts.src : [opts.src];
    srcArr.forEach(function(pattern) {
        src = src.concat(glob.sync(pattern));
    });

    src.forEach(function(file) {
        var contents = String(fs.readFileSync(file));
        var stream = includeSource.getStream(opts, file);

        stream.write(contents);
        stream.end();
        streams = streams.concat(stream);
    });

    if (typeof opts.onStreamsEnd === 'function') {
        var index = streams.length;
        streams.forEach(function(stream) {
            stream.once('data', function() {
                index--;
                if (index === 0) {
                    opts.onStreamsEnd();
                }
            });
        });
    }

    return streams;
};

includeSource.getStream = function(options, file) {
    var opts = options || {};

    var stream = through.obj(function(obj, enc, callback) {
        try {
            obj = replaceIncludes(obj, opts);
        } catch (err) {
            this.emit('error', err);
        }

        this.push(obj);
        return callback();
    });

    if (opts.stdout) {
        stream.pipe(process.stdout);
    }
    if (opts.output) {
        var parse = path.parse(file);
        if (parse.dir === '') {
            parse.dir = '.';
        }
        var outputfile = opts.output.replace('{{path}}', parse.dir).replace('{{filename}}', parse.name).replace('{{ext}}', parse.ext.substr(1, parse.ext.length - 1));
        var fileStream = fs.createWriteStream(outputfile, {
            encoding: 'utf-8'
        });
        stream.pipe(fileStream);
        stream.on('end', fileStream.end);
    }
    if (opts['in-place']) {
        var fStream = fs.createWriteStream(file, {
            encoding: 'utf-8'
        });
        stream.pipe(fStream);
        stream.on('end', fStream.end);
    }

    return stream;
};

module.exports = includeSource;
