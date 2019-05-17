"use strict";
// SetMeUp: index.ts
const crypto = require("./crypto");
const utils = require("./utils");
const EventEmitter = require("eventemitter3");
/** @hidden */
const _ = require("lodash");
/** @hidden */
const fs = require("fs");
/** @hidden */
let env = process.env;
/** @hidden */
let logger = null;
/**
 * This is the main SetMeUp class.
 * * @example const setmeup = require("setmeup")
 */
class SetMeUp {
    /**
     * Default SetMeUp constructor.
     * @param doNotLoad Optional, if true will not auto load settings from file(s).
     */
    constructor(doNotLoad) {
        // PROPERTIES
        // --------------------------------------------------------------------------
        /** Internal, the actual settings storage object. */
        this._settings = {};
        /** Event emitter. */
        this.events = new EventEmitter();
        /** Array of loaded files. */
        this.files = [];
        if (!logger) {
            try {
                logger = require("anyhow");
            }
            catch (ex) {
                // Anyhow module not found
            }
        }
        if (!doNotLoad) {
            this.load();
        }
    }
    /** @hidden */
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    /**
     * Returns a new fresh instance of the SetMeUp module.
     * @param doNotLoad Optional, if true will not load settings from file on new instance.
     * @returns New instance of SetMeUp with its own fresh settings.
     */
    newInstance(doNotLoad) {
        return new SetMeUp(doNotLoad);
    }
    /** Exposes the settings object as read only. */
    get settings() {
        return this._settings;
    }
    // EVENTS
    // --------------------------------------------------------------------------
    /**
     * Bind callback to event. Shortcut to `events.on()`.
     * @param eventName The name of the event ([[load]], [[reset]]).
     * @param callback Callback function.
     */
    on(eventName, callback) {
        this.events.on(eventName, callback);
    }
    /**
     * Bind callback to event that will be triggered only once. Shortcut to `events.once()`.
     * @param eventName The name of the event.
     * @param callback Callback function.
     */
    once(eventName, callback) {
        this.events.on(eventName, callback);
    }
    /**
     * Unbind callback from event. Shortcut to `events.off()`.
     * @param eventName The name of the event ([[load]], [[reset]]).
     * @param callback Callback function.
     */
    off(eventName, callback) {
        this.events.off(eventName, callback);
    }
    // MAIN METHODS
    // --------------------------------------------------------------------------
    /**
     * Load settings from the specified JSON file(s). If not files are specified, load
     * from the defaults (settings.default.json, settings.json and settings.NODE_ENV.json).
     * @param filenames The filename or array of filenames, using relative or full path.
     * @param options Load options defining if properties should be overwritten, and root settings key.
     * @returns Returns the resulting JSON object of the loaded files, or null if nothing was loaded.
     * @event load
     */
    load(filenames, options) {
        let result = {};
        // Set default options.
        if (!options)
            options = {};
        _.defaults(options, { overwrite: true, rootKey: "" });
        // No filenames passed? Load the default ones.
        /* istanbul ignore else */
        if (!filenames) {
            filenames = ["settings.default.json", "settings.json", `settings.${env.NODE_ENV}.json`];
        }
        // Make sure we're dealing with array of filenames by default.
        else if (_.isString(filenames)) {
            filenames = [filenames];
        }
        for (let filename of filenames) {
            let settingsJson = utils.loadJson(filename, options.crypto);
            // Add file to the `files` list, but only if not loaded previously.
            if (settingsJson != null) {
                if (_.find(this.files, { filename }) == null) {
                    this.files.push({ filename, watching: false });
                }
                else {
                    logger.debug("SetMeUp.load", filename, "Loaded before, so won't add to the files list");
                }
            }
            /* istanbul ignore else */
            if (logger) {
                logger.info("SetMeUp.load", filename, "Loaded");
            }
            // Extend loaded settings.
            if (options.rootKey) {
                utils.extend(settingsJson[options.rootKey], result, options.overwrite);
            }
            else {
                utils.extend(settingsJson, result, options.overwrite);
            }
            // Emit load passing filenames and loaded settings result.
            this.events.emit("load", filename, result);
        }
        // Nothing loaded? Return null.
        if (_.keys(result).length < 1) {
            return null;
        }
        // Extend loaded settings.
        utils.extend(result, this.settings, options.overwrite);
        // Return the JSON representation of the loaded settings.
        return result;
    }
    /**
     * Load settings from environment variables, restricting to the passed prefix.
     * Enviroment settings as variables will be split by underscore to define its tree.
     * @param prefix The prefix use to match relevant environment variables. Default is "SMU_".
     * @param options Load options defining if properties should be overwritten, and root settings key.
     * @event loadFromEnv
     */
    loadFromEnv(prefix, options) {
        let result = {};
        let keys = _.keys(process.env);
        // Use "SMU_" as default prefix.
        if (!prefix || prefix == "") {
            prefix = "SMU_";
        }
        // Make sure prefix ends with underscore!
        else if (prefix.substring(prefix.length - 1) != "_") {
            prefix += "_";
        }
        // Set default options.
        if (!options)
            options = {};
        _.defaults(options, { overwrite: true });
        // Iterate and process relevant variables.
        // Each underscore defines a level on the settings tree.
        for (let key of keys) {
            if (key.substring(0, prefix.length) == prefix) {
                let target = this.settings;
                let arr = key.substring(prefix.length).split("_");
                // Force lowercase.
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = arr[i].toLowerCase();
                }
                let limit = arr.length - 1;
                // Iterate keys to make the settings tree, making sure each sub-key exists.
                for (let i = 0; i < limit; i++) {
                    if (typeof target[arr[i]] === "undefined" || target[arr[i]] === null) {
                        target[arr[i]] = {};
                    }
                    target = target[arr[i]];
                }
                target[arr.pop()] = process.env[key];
            }
        }
        // Emit load passing prefix and loaded settings result.
        this.events.emit("loadFromEnv", prefix, result);
        // Nothing loaded? Return null.
        if (_.keys(result).length < 1) {
            return null;
        }
        // Extend loaded settings.
        utils.extend(result, this.settings, options.overwrite);
        // Return the JSON representation of the loaded settings.
        return result;
    }
    /**
     * Reset to default settings by unwatching and clearing settings, then re-calling [[load]].
     * @event reset
     */
    reset() {
        this.unwatch();
        this.files = [];
        this._settings = {};
        this.events.emit("reset");
    }
    // ENCRYPTION
    // --------------------------------------------------------------------------
    /**
     * Encrypts the specified settings file.
     * @param filename The file to be encrypted.
     * @param options Options cipher, key and IV to be passed to the encryptor.
     */
    encrypt(filename, options) {
        const result = JSON.stringify(crypto.CryptoMethod("encrypt", filename, options), null, 4);
        fs.writeFileSync(filename, result, { encoding: "utf8" });
    }
    /**
     * Decrypts the specified settings file.
     * @param filename The file to be decrypted.
     * @param options Options cipher, key and IV to be passed to the decryptor.
     */
    decrypt(filename, options) {
        const result = JSON.stringify(crypto.CryptoMethod("decrypt", filename, options), null, 4);
        fs.writeFileSync(filename, result, { encoding: "utf8" });
    }
    // FILE WATCHER
    // --------------------------------------------------------------------------
    /**
     * Watch loaded settings files for changes by using a file watcher.
     * When files change, [[load]] will be called to get the updates.
     */
    watch() {
        // Iterate loaded files to create the file system watchers.
        for (let f of Array.from(this.files)) {
            ;
            (f => {
                const filename = utils.getFilePath(f.filename);
                if (filename != null && !f.watching) {
                    f.watching = true;
                    return fs.watchFile(filename, { persistent: true }, () => {
                        this.load(filename);
                        /* istanbul ignore else */
                        if (logger) {
                            logger.info("Settings.watch", f, "Reloaded");
                        }
                    });
                }
            })(f);
        }
        /* istanbul ignore else */
        if (logger) {
            logger.info("Settings.watch");
        }
    }
    /**
     * Unwatch changes on loaded settings files.
     */
    unwatch() {
        try {
            for (let f of Array.from(this.files)) {
                const filename = utils.getFilePath(f.filename);
                f.watching = false;
                if (filename != null) {
                    fs.unwatchFile(filename);
                }
            }
        }
        catch (ex) {
            /* istanbul ignore next */
            if (logger) {
                logger.error("Settings.unwatch", ex);
            }
        }
        /* istanbul ignore else */
        if (logger) {
            return logger.info("Settings.unwatch");
        }
    }
}
SetMeUp._instance = null;
module.exports = SetMeUp.Instance;
