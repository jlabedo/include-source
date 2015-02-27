'use strict';

var assert = require('assert'),
    sinon = require('sinon'),
    glob = require('glob'),
    fs = require('fs'),
    mockfs = require('mock-fs'),
    through = require('through2');

var includeSource = require('../include-source');

function captureStream(stream) {
    var oldWrite = stream.write;
    var buf = '';
    stream.write = function(chunk, encoding, callback) {
        debugger;
        buf += chunk.toString(); // chunk is a String or Buffer
        // oldWrite.apply(stream, arguments);
    }

    return {
        unhook: function unhook() {
            stream.write = oldWrite;
        },
        captured: function() {
            return buf;
        }
    };
}

describe('include-source', function() {
    describe('replace functionality', function() {
        var globStub;
        var fsStub;

        before(function() {
            globStub = sinon.stub(glob, 'sync', function() {
                return [
                    'files/file1.ext',
                    'files/file2.ext'
                ];
            });

            fsStub = sinon.stub(fs, 'readFileSync', function(filename) {
                if (filename == 'files/file1.ext') {
                    return '<head>\n<!-- include:css(css/**/*.css) -->\n<!-- endinclude -->\n</head>\n';
                } else if (filename == 'files/file2.ext') {
                    return '<head>\n<!-- include:js(js/**/*.css) -->\n<!-- endinclude -->\n</head>\n';
                }
            });
        });
        after(function() {
            globStub.restore();
            fsStub.restore();
        });

        it('should replace the placeholder with scripts', function(done) {
            var stream = includeSource.getStream();
            stream.once('data', function(file) {
                //assert(file.isBuffer());
                assert.equal(file.toString('utf8'), '<html>\n<script src="files/file1.ext"></script>\n<script src="files/file2.ext"></script>\n</html>');
                done();
            });

            stream.write('<html>\n<!-- include:js(scripts/**/*.js) -->\n<!-- endinclude -->\n</html>');
            stream.end();
        });

        it('should replace the placeholder with css', function(done) {
            var stream = includeSource.getStream();
            stream.once('data', function(file) {
                //assert(file.isBuffer());
                assert.equal(file.toString('utf8'), '<link rel="stylesheet" href="files/file1.ext">\n<link rel="stylesheet" href="files/file2.ext">');
                done();
            });

            stream.write('<!-- include:css(css/**/*.css) -->\n<!-- endinclude -->');
            stream.end();
        });
    });

    describe('output functionality', function() {
        beforeEach(function() {
            mockfs({
                'files': {
                    'index.html': '<head>\n<!-- include:css(css/**/*.css) -->\n<!-- endinclude -->\n</head>\n'
                },
                'css': {
                    'style1.css': '',
                    'style2.css': ''
                }
            });
        });
        afterEach(function() {
            mockfs.restore();
        });

        it('should output the result to stdout', function(done) {
            // Catpure stdout
            var hook = captureStream(process.stdout);
            includeSource({
                stdout: true,
                src: 'files/index.html',
                onStreamsEnd: function() {
                    hook.unhook();
                    assert.equal(hook.captured(), '<head>\n<link rel="stylesheet" href="css/style1.css">\n<link rel="stylesheet" href="css/style2.css">\n</head>\n');
                    done();
                }
            });

        });

        it('should output the result to a file', function(done) {
            var streams = includeSource({
                src: 'files/index.html',
                output: '{{path}}/{{filename}}.out.{{ext}}',
                onStreamsEnd: function() {
                    assert(fs.statSync('files/index.out.html').isFile(), 'File has not been written to fs');
                    assert.equal(String(fs.readFileSync('files/index.out.html')), '<head>\n<link rel="stylesheet" href="css/style1.css">\n<link rel="stylesheet" href="css/style2.css">\n</head>\n');
                    done();
                }
            });
        });

        it('should output the result in place', function(done) {
            includeSource({
                src: 'files/index.html',
                'in-place': true,
                onStreamsEnd: function() {
                    assert.equal(String(fs.readFileSync('files/index.html')), '<head>\n<link rel="stylesheet" href="css/style1.css">\n<link rel="stylesheet" href="css/style2.css">\n</head>\n');
                    done();
                }
            });
        });
    });
});
