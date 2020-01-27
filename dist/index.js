"use strict";
/*
 * Copyright 2015, Yahoo Inc.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var p = __importStar(require("path"));
var fs_1 = require("fs");
var fs_extra_1 = require("fs-extra");
var dist_1 = require("intl-messageformat-parser/dist");
var declare = require('@babel/helper-plugin-utils').declare;
var core_1 = require("@babel/core");
var types_1 = require("@babel/types");
var schema_utils_1 = __importDefault(require("schema-utils"));
var options_schema_json_1 = __importDefault(require("./options.schema.json"));
var DEFAULT_COMPONENT_NAMES = ['FormattedMessage', 'FormattedHTMLMessage'];
var EXTRACTED = Symbol('ReactIntlExtracted');
var DESCRIPTOR_PROPS = new Set(['id', 'description', 'defaultMessage']);
function getICUMessageValue(messagePath, _a) {
    var _b = (_a === void 0 ? {} : _a).isJSXSource, isJSXSource = _b === void 0 ? false : _b;
    if (!messagePath) {
        return '';
    }
    var message = getMessageDescriptorValue(messagePath);
    try {
        dist_1.parse(message);
    }
    catch (parseError) {
        if (isJSXSource &&
            messagePath.isLiteral() &&
            message.indexOf('\\\\') >= 0) {
            throw messagePath.buildCodeFrameError('[React Intl] Message failed to parse. ' +
                'It looks like `\\`s were used for escaping, ' +
                "this won't work with JSX string literals. " +
                'Wrap with `{}`. ' +
                'See: http://facebook.github.io/react/docs/jsx-gotchas.html');
        }
        throw messagePath.buildCodeFrameError('[React Intl] Message failed to parse. ' +
            'See: http://formatjs.io/guides/message-syntax/' +
            ("\n" + parseError));
    }
    return message;
}
function evaluatePath(path) {
    var evaluated = path.evaluate();
    if (evaluated.confident) {
        return evaluated.value;
    }
    throw path.buildCodeFrameError('[React Intl] Messages must be statically evaluate-able for extraction.');
}
function getMessageDescriptorKey(path) {
    if (path.isIdentifier() || path.isJSXIdentifier()) {
        return path.node.name;
    }
    return evaluatePath(path);
}
function getMessageDescriptorValue(path) {
    if (!path) {
        return '';
    }
    if (path.isJSXExpressionContainer()) {
        path = path.get('expression');
    }
    // Always trim the Message Descriptor values.
    var descriptorValue = evaluatePath(path);
    return descriptorValue;
}
function createMessageDescriptor(propPaths) {
    return propPaths.reduce(function (hash, _a) {
        var keyPath = _a[0], valuePath = _a[1];
        var key = getMessageDescriptorKey(keyPath);
        if (DESCRIPTOR_PROPS.has(key)) {
            hash[key] = valuePath;
        }
        return hash;
    }, {
        id: undefined,
        defaultMessage: undefined,
        description: undefined,
    });
}
function evaluateMessageDescriptor(descriptorPath, isJSXSource, filename, overrideIdFn) {
    if (isJSXSource === void 0) { isJSXSource = false; }
    var id = getMessageDescriptorValue(descriptorPath.id);
    var defaultMessage = getICUMessageValue(descriptorPath.defaultMessage, {
        isJSXSource: isJSXSource,
    });
    var description = getMessageDescriptorValue(descriptorPath.description);
    if (overrideIdFn) {
        id = overrideIdFn(id, defaultMessage, description, p.relative(process.cwd(), filename));
    }
    var descriptor = {
        id: id,
    };
    if (description) {
        descriptor.description = description;
    }
    if (defaultMessage) {
        descriptor.defaultMessage = defaultMessage;
    }
    return descriptor;
}
function storeMessage(_a, path, _b, filename, messages) {
    var id = _a.id, description = _a.description, defaultMessage = _a.defaultMessage;
    var extractSourceLocation = _b.extractSourceLocation;
    if (!id && !defaultMessage) {
        throw path.buildCodeFrameError('[React Intl] Message Descriptors require an `id` or `defaultMessage`.');
    }
    if (messages.has(id)) {
        var existing = messages.get(id);
        if (description !== existing.description ||
            defaultMessage !== existing.defaultMessage) {
            throw path.buildCodeFrameError("[React Intl] Duplicate message id: \"" + id + "\", " +
                'but the `description` and/or `defaultMessage` are different.');
        }
    }
    var loc = {};
    if (extractSourceLocation) {
        loc = __assign({ file: p.relative(process.cwd(), filename) }, path.node.loc);
    }
    messages.set(id, __assign({ id: id, description: description, defaultMessage: defaultMessage }, loc));
}
function referencesImport(path, mod, importedNames) {
    if (!(path.isIdentifier() || path.isJSXIdentifier())) {
        return false;
    }
    return importedNames.some(function (name) { return path.referencesImport(mod, name); });
}
function isFormatMessageCall(callee) {
    if (!callee.isMemberExpression()) {
        return false;
    }
    var object = callee.get('object');
    var property = callee.get('property');
    return (property.isIdentifier() &&
        property.node.name === 'formatMessage' &&
        // things like `intl.formatMessage`
        ((object.isIdentifier() && object.node.name === 'intl') ||
            // things like `this.props.intl.formatMessage`
            (object.isMemberExpression() &&
                object.get('property').node.name === 'intl')));
}
function assertObjectExpression(path, callee) {
    if (!path || !path.isObjectExpression()) {
        throw path.buildCodeFrameError("[React Intl] `" + callee.get('property').node.name + "()` must be " +
            'called with an object expression with values ' +
            'that are React Intl Message Descriptors, also ' +
            'defined as object expressions.');
    }
    return true;
}
exports.default = declare(function (api, options) {
    api.assertVersion(7);
    schema_utils_1.default(options_schema_json_1.default, options, {
        name: 'babel-plugin-react-intl',
        baseDataPath: 'options',
    });
    var messagesDir = options.messagesDir;
    /**
     * Store this in the node itself so that multiple passes work. Specifically
     * if we remove `description` in the 1st pass, 2nd pass will fail since
     * it expect `description` to be there.
     * HACK: We store this in the node instance since this persists across
     * multiple plugin runs
     */
    function tagAsExtracted(path) {
        path.node[EXTRACTED] = true;
    }
    function wasExtracted(path) {
        return !!path.node[EXTRACTED];
    }
    return {
        pre: function () {
            if (!this.ReactIntlMessages) {
                this.ReactIntlMessages = new Map();
            }
        },
        post: function (state) {
            var filename = this.file.opts.filename;
            // If no filename is specified, that means this babel plugin is called programmatically
            // via NodeJS API by other programs (e.g. by feeding us with file content directly). In
            // this case we will only make extracted messages accessible via Babel result objects.
            var basename = filename
                ? p.basename(filename, p.extname(filename))
                : null;
            var messages = this.ReactIntlMessages;
            var descriptors = Array.from(messages.values());
            state.metadata['react-intl'] = { messages: descriptors };
            if (basename && messagesDir && descriptors.length > 0) {
                // Make sure the relative path is "absolute" before
                // joining it with the `messagesDir`.
                var relativePath = p.join(p.sep, p.relative(process.cwd(), filename));
                // Solve when the window user has symlink on the directory, because
                // process.cwd on windows returns the symlink root,
                // and filename (from babel) returns the original root
                if (process.platform === 'win32') {
                    var name_1 = p.parse(process.cwd()).name;
                    if (relativePath.includes(name_1)) {
                        relativePath = relativePath.slice(relativePath.indexOf(name_1) + name_1.length);
                    }
                }
                var messagesFilename = p.join(messagesDir, p.dirname(relativePath), basename + '.json');
                var messagesFile = JSON.stringify(descriptors, null, 2);
                fs_extra_1.mkdirpSync(p.dirname(messagesFilename));
                fs_1.writeFileSync(messagesFilename, messagesFile);
            }
        },
        visitor: {
            JSXOpeningElement: function (path, _a) {
                var opts = _a.opts, filename = _a.file.opts.filename;
                var _b = opts.moduleSourceName, moduleSourceName = _b === void 0 ? 'react-intl' : _b, _c = opts.additionalComponentNames, additionalComponentNames = _c === void 0 ? [] : _c, removeDefaultMessage = opts.removeDefaultMessage, overrideIdFn = opts.overrideIdFn;
                if (wasExtracted(path)) {
                    return;
                }
                var name = path.get('name');
                if (name.referencesImport(moduleSourceName, 'FormattedPlural')) {
                    if (path.node && path.node.loc)
                        console.warn("[React Intl] Line " + path.node.loc.start.line + ": " +
                            'Default messages are not extracted from ' +
                            '<FormattedPlural>, use <FormattedMessage> instead.');
                    return;
                }
                if (name.isJSXIdentifier() &&
                    (referencesImport(name, moduleSourceName, DEFAULT_COMPONENT_NAMES) ||
                        additionalComponentNames.includes(name.node.name))) {
                    var attributes = path
                        .get('attributes')
                        .filter(function (attr) {
                        return attr.isJSXAttribute();
                    });
                    var descriptorPath = createMessageDescriptor(attributes.map(function (attr) { return [
                        attr.get('name'),
                        attr.get('value'),
                    ]; }));
                    // In order for a default message to be extracted when
                    // declaring a JSX element, it must be done with standard
                    // `key=value` attributes. But it's completely valid to
                    // write `<FormattedMessage {...descriptor} />`, because it will be
                    // skipped here and extracted elsewhere. The descriptor will
                    // be extracted only (storeMessage) if a `defaultMessage` prop.
                    if (descriptorPath.id && descriptorPath.defaultMessage) {
                        // Evaluate the Message Descriptor values in a JSX
                        // context, then store it.
                        var descriptor_1 = evaluateMessageDescriptor(descriptorPath, true, filename, overrideIdFn);
                        storeMessage(descriptor_1, path, opts, filename, this.ReactIntlMessages);
                        attributes.forEach(function (attr) {
                            var ketPath = attr.get('name');
                            var msgDescriptorKey = getMessageDescriptorKey(ketPath);
                            if (
                            // Remove description since it's not used at runtime.
                            msgDescriptorKey === 'description' ||
                                // Remove defaultMessage if opts says so.
                                (removeDefaultMessage && msgDescriptorKey === 'defaultMessage')) {
                                attr.remove();
                            }
                            else if (overrideIdFn &&
                                getMessageDescriptorKey(ketPath) === 'id') {
                                attr.get('value').replaceWith(core_1.types.stringLiteral(descriptor_1.id));
                            }
                        });
                        // Tag the AST node so we don't try to extract it twice.
                        tagAsExtracted(path);
                    }
                }
            },
            CallExpression: function (path, _a) {
                var opts = _a.opts, filename = _a.file.opts.filename;
                var messages = this.ReactIntlMessages;
                var _b = opts.moduleSourceName, moduleSourceName = _b === void 0 ? 'react-intl' : _b, overrideIdFn = opts.overrideIdFn, removeDefaultMessage = opts.removeDefaultMessage, extractFromFormatMessageCall = opts.extractFromFormatMessageCall;
                var callee = path.get('callee');
                /**
                 * Process MessageDescriptor
                 * @param messageDescriptor Message Descriptor
                 */
                function processMessageObject(messageDescriptor) {
                    assertObjectExpression(messageDescriptor, callee);
                    if (wasExtracted(messageDescriptor)) {
                        return;
                    }
                    var properties = messageDescriptor.get('properties');
                    var descriptorPath = createMessageDescriptor(properties.map(function (prop) {
                        return [prop.get('key'), prop.get('value')];
                    }));
                    // Evaluate the Message Descriptor values, then store it.
                    var descriptor = evaluateMessageDescriptor(descriptorPath, false, filename, overrideIdFn);
                    storeMessage(descriptor, messageDescriptor, opts, filename, messages);
                    // Remove description since it's not used at runtime.
                    messageDescriptor.replaceWith(core_1.types.objectExpression(__spreadArrays([
                        core_1.types.objectProperty(core_1.types.stringLiteral('id'), core_1.types.stringLiteral(descriptor.id))
                    ], (!removeDefaultMessage && descriptor.defaultMessage
                        ? [
                            core_1.types.objectProperty(core_1.types.stringLiteral('defaultMessage'), core_1.types.stringLiteral(descriptor.defaultMessage)),
                        ]
                        : []))));
                    // Tag the AST node so we don't try to extract it twice.
                    tagAsExtracted(messageDescriptor);
                }
                // Check that this is `defineMessages` call
                if (isMultipleMessagesDeclMacro(callee, moduleSourceName) ||
                    isSingularMessagesDeclMacro(callee)) {
                    var firstArgument = path.get('arguments')[0];
                    var messagesObj = getMessagesObjectFromExpression(firstArgument);
                    if (assertObjectExpression(messagesObj, callee)) {
                        if (isSingularMessagesDeclMacro(callee)) {
                            processMessageObject(messagesObj);
                        }
                        else {
                            messagesObj
                                .get('properties')
                                .map(function (prop) { return prop.get('value'); })
                                .forEach(processMessageObject);
                        }
                    }
                }
                // Check that this is `intl.formatMessage` call
                if (extractFromFormatMessageCall && isFormatMessageCall(callee)) {
                    var messageDescriptor = path.get('arguments')[0];
                    if (messageDescriptor.isObjectExpression()) {
                        processMessageObject(messageDescriptor);
                    }
                }
            },
        },
    };
});
function isMultipleMessagesDeclMacro(callee, moduleSourceName) {
    return (referencesImport(callee, moduleSourceName, ['defineMessages']) ||
        referencesImport(callee, '@formatjs/macro', ['defineMessages']));
}
function isSingularMessagesDeclMacro(callee) {
    return referencesImport(callee, '@formatjs/macro', ['_']);
}
function getMessagesObjectFromExpression(nodePath) {
    var currentPath = nodePath;
    while (types_1.isTSAsExpression(currentPath.node) ||
        types_1.isTSTypeAssertion(currentPath.node) ||
        types_1.isTypeCastExpression(currentPath.node)) {
        currentPath = currentPath.get('expression');
    }
    return currentPath;
}
//# sourceMappingURL=index.js.map