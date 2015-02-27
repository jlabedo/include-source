#!/usr/bin/env node

'use strict';

var includeSource = require('./include-source.js');
var argv = require('yargs')
	.usage('Command line tool to include script and style files into your HTML files.\nUsage: $0 SOURCE [options]')
	.demand(1)
    .options({
        'o': {
            alias: 'output',
            type: 'string',
            describe: 'Save output to ARG. Variables {{path}}, {{filename}} and {{ext}} are available in case of multiple files.'
        },
        'v': {
            alias: 'version',
            describe: 'Print version number.'
        },
        'i': {
        	alias: 'in-place',
        	describe: 'Save output directly to SOURCE.'
        },
        'r':{
        	alias: 'remove-comments',
        	describe: 'Remove comments block from output.',
        	type: 'boolean',
        	default: false
        },
        'stdout':{
        	describe: 'Print output to stdout.',
        	type:'boolean'
        }
    })
    .requiresArg('o')
    .version(function() {
        return require('./package').version;
    })
    .help('help')
    .alias('h', 'help')
    .argv;

argv.src = argv['_'];
debugger;
includeSource(argv);
