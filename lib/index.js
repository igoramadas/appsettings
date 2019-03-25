"use strict";
/**
 * SetMeUp
 */
const crypto = require("./crypto");
const utils = require("./utils");
const EventEmitter = require("eventemitter3");
const _ = require("lodash");
const fs = require("fs");
let env = process.env.NODE_ENV || "development";
let anyhow = null;
/** Main SetMeUp class. */
class SetMeUp {
    /**
     * Default SetMeUp constructor.
     * @param clean Optional, if true will not load settings from file on new instance.
     */
    constructor(clean) {
        /** Event emitter, internal only */
        this.events = new EventEmitter();
        /** Object that hold the actual settings */
        this.settings = {};
        /** Array of loaded files */
        this.files = [];
        if (!anyhow) {
            try {
                anyhow = require("anyhow");
            }
            catch (ex) {
                // Anyhow module not found
            }
        }
        if (!clean) {
            this.load();
        }
    }
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    /**
     * Returns a new fresh instance of the SetMeUp module.
     * @param clean Optional, if true will not load settings from file on new instance.
     */
    newInstance(clean) {
        const obj = new SetMeUp();
        if (!clean) {
            obj.load();
        }
        return obj;
    }
    on(eventName, callback) {
        this.events.on(eventName, callback);
    }
    off(eventName, callback) {
        this.events.off(eventName, callback);
    }
    // MAIN METHODS
    // --------------------------------------------------------------------------
    /**
     * Load settings from the specified JSON files. If not files are specified, load
     * from the default filenames (settings.default.json, settings.json and settings.ENV.json).
     * @param filenames The filename or array of filenames, using relative or full path.
     * @param overwrite If false it won't update settings that are already defined, default is true.
     * @returns Returns the JSON representation object of the loaded files. Will return null if nothing was loaded.
     */
    load(filenames, overwrite) {
        let result = {};
        if (overwrite == null) {
            overwrite = true;
        }
        // No filenames passed? Load the default ones.
        if (!filenames) {
            filenames = ["settings.default.json", "settings.json", `settings.${env}.json`];
        }
        // Make sure we're dealing with array of filenames by default.
        else if (_.isString(filenames)) {
            filenames = [filenames];
        }
        for (let filename of filenames) {
            let settingsJson = utils.loadJson(filename);
            // Add file to the `files` list, but only if not loaded previously.
            if (settingsJson != null && _.find(this.files, { filename }) == null) {
                this.files.push({ filename, watching: false });
            }
            if (env != "test" && anyhow) {
                anyhow.debug("SetMeUp.load", filename);
            }
            // Extend loaded settings.
            utils.extend(settingsJson, result, overwrite);
            // Emit load passing filenames and loaded settings result.
            this.events.emit("load", filename, result);
        }
        // Nothing loaded? Return null.
        if (_.keys(result).length < 1) {
            return null;
        }
        // Extend loaded settings.
        utils.extend(result, this.settings, overwrite);
        // Return the JSON representation of the loaded settings.
        return result;
    }
    /**
     * Reset to default settings by clearing values and listeners, and re-calling `load`.
     */
    reset() {
        this.unwatch();
        this.files = [];
        this.settings = { general: { debug: false } };
    }
    // ENCRYPTION
    // --------------------------------------------------------------------------
    /**
     * Encrypts the specified settings file.
     * @param filename The file to be encrypted.
     * @param options Options cipher, key and IV to be passed to the encryptor.
     */
    encrypt(filename, options) {
        crypto.CryptoMethod("encrypt", filename, options);
    }
    /**
     * Decrypts the specified settings file.
     * @param filename The file to be decrypted.
     * @param options Options cipher, key and IV to be passed to the decryptor.
     */
    decrypt(filename, options) {
        crypto.CryptoMethod("decrypt", filename, options);
    }
    // FILE WATCHER
    // --------------------------------------------------------------------------
    /**
     * Watch loaded settings files for changes by using a file watcher.
     */
    watch() {
        env = process.env.NODE_ENV || "development";
        // Iterate loaded files to create the file system watchers.
        for (let f of Array.from(this.files)) {
            ;
            (f => {
                const filename = utils.getFilePath(f.filename);
                if (filename != null && !f.watching) {
                    f.watching = true;
                    return fs.watchFile(filename, { persistent: true }, () => {
                        this.load(filename);
                        if (env != "test" && anyhow) {
                            anyhow.info("Settings.watch", f, "Reloaded");
                        }
                    });
                }
            })(f);
        }
        if (env != "test" && anyhow) {
            anyhow.info("Settings.watch");
        }
    }
    /**
     * Unwatch changes on loaded settings files.
     */
    unwatch() {
        env = process.env.NODE_ENV || "development";
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
            if (anyhow) {
                anyhow.error("Settings.unwatch", ex);
            }
        }
        if (env != "test" && anyhow) {
            return anyhow.info("Settings.unwatch");
        }
    }
}
module.exports = SetMeUp.Instance;
