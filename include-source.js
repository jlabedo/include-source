'use strict';

var through = require('through2'),
    glob = require('glob'),
    path = require('path'),
    gaze = require('gaze'),
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

var watches = {};
function addWatch(filepath, fileGlob, opts) {
    watches[filepath].push(gaze(fileGlob, function() {
        this.on('added', function() {
            onEvent(filepath, opts);
        });
        this.on('deleted', function() {
            onEvent(filepath, opts);
        });
    }));
}

function resetWatches(filepath) {
    if (typeof watches[filepath] != 'undefined') {
        watches[filepath].forEach(function(watch) {
            watch.close();
        });
        delete watches[filepath];
    }
    watches[filepath] = [];
}

// TODO: Not really thread safe
var changesBeingMade = {};
function onEvent(filepath, opts) {
    if (changesBeingMade[filepath] === true) {
        return;
    }
    changesBeingMade[filepath] = true;
    processSourceFiles(filepath, opts, function() {
        changesBeingMade[filepath] = false;
    });
}

function replaceIncludes(contents, options, filepath) {
    var cwd = options.cwd || process.cwd();

    resetWatches(filepath);

    return contents.replace(regex, function(match, startBlock, spacing, blockType, fileGlob, oldScripts, endBlock, offset, string) {
        var placeholder = placeholders[blockType];
        var files = parseFiles(fileGlob, cwd);

        var includes = spacing + files.map(function(filename) {
            return placeholder.replace('{{filename}}', filename);
        }).join('\n' + spacing);

        if (options.watch) {
            addWatch(filepath, fileGlob, options);
        }

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

function processSourceFiles(src, opts, callback) {
    var srcList = Array.isArray(src) ? src : [src],
        index = srcList.length,
        streams = srcList.map(function(file) {
            var contents = String(fs.readFileSync(file)),
                stream = includeSource.getStream(opts, file);

            stream.write(contents);
            stream.end();
            stream.once('end', function() {
                index--;
                if (index === 0) {
                    if (typeof opts.onStreamsEnd === 'function') {
                        opts.onStreamsEnd();
                    }
                    if (typeof callback === 'function') {
                        callback();
                    }
                }
            });
            return stream;
        });

    return streams;
}

var includeSource = function(opts) {
    var sourceWatchers = [];
    var src = [];
    var srcArr = Array.isArray(opts.src) ? opts.src : [opts.src];
    srcArr.forEach(function(pattern) {
        var srcList = glob.sync(pattern);
        src = src.concat(srcList);

        // Put watchers on source files
        if (opts.watch) {
            sourceWatchers.push({
                pattern: pattern,
                watch: gaze(pattern, function() {
                    this.on('changed', function(filepath) {
                        onEvent(filepath, opts);
                    });
                    this.on('added', function(filepath) {
                        onEvent(filepath, opts);
                    });
                })
            });
        }
    });

    return processSourceFiles(src, opts);
};

includeSource.getStream = function(options, file) {
    var opts = options || {};

    /**
     * Stream : Replace includes in source file
     */
    var stream = through.obj(function(obj, enc, callback) {
        try {
            obj = replaceIncludes(obj, opts, file);
        } catch (err) {
            this.emit('error', err);
        }

        this.push(obj);
        return callback();
    });

    /**
     * Stream : Pipe to desired output
     */
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
