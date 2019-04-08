// SetMeUp: index.ts

import * as crypto from "./crypto"
import * as utils from "./utils"
import EventEmitter = require("eventemitter3")

/** @hidden */
const _ = require("lodash")
/** @hidden */
const fs = require("fs")

/** @hidden */
let env = process.env
/** @hidden */
let logger = null

/** Represents a loaded file. */
interface LoadedFile {
    /** Filename of the loaded settings file. */
    filename: string
    /** True if file is being watched for updates. */
    watching: boolean
}

/** Represents loading options. */
interface LoadOptions {
    /** Overwrite current settings with loaded ones? */
    overwrite?: boolean
    /** Root key of settings to be loaded. */
    rootKey?: string
    /** Decryption options in case file is encrypted. */
    crypto?: crypto.CryptoOptions | boolean
}

/** This is the main SetMeUp class. */
class SetMeUp {
    private static _instance: SetMeUp = null
    /** @hidden */
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * Returns a new fresh instance of the SetMeUp module.
     * @param doNotLoad Optional, if true will not load settings from file on new instance.
     * @returns New instance of SetMeUp, with its own settings.
     */
    newInstance(doNotLoad?: boolean): SetMeUp {
        return new SetMeUp(doNotLoad)
    }

    /**
     * Default SetMeUp constructor.
     * @param doNotLoad Optional, if true will not load settings from file on new instance.
     */
    constructor(doNotLoad?: boolean) {
        if (!logger) {
            try {
                logger = require("anyhow")
            } catch (ex) {
                // Anyhow module not found
            }
        }

        if (!doNotLoad) {
            this.load()
        }
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Internal, the actual settings storage object. */
    private _settings: any = {}

    /** Exposes the settings object as read only. */
    get settings() {
        return this._settings
    }

    /** Event emitter. */
    events: EventEmitter = new EventEmitter()

    /** Array of loaded files. */
    files: LoadedFile[] = []

    /**
     * Bind callback to event.
     * @param eventName The name of events (load, reset).
     * @param callback Callback function.
     */
    on(eventName: string, callback: EventEmitter.ListenerFn): void {
        this.events.on(eventName, callback)
    }

    /**
     * Unbind callback from event.
     * @param eventName The name of events (load, reset).
     * @param callback Callback function.
     */
    off(eventName: string, callback: EventEmitter.ListenerFn): void {
        this.events.off(eventName, callback)
    }

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Load settings from the specified JSON files. If not files are specified, load
     * from the default filenames (settings.default.json, settings.json and settings.ENV.json).
     * @param filenames The filename or array of filenames, using relative or full path.
     * @param options Load options defining if properties should be overwritten, and root settings key.
     * @returns Returns the JSON representation object of the loaded files. Will return null if nothing was loaded.
     */
    load(filenames?: string | string[], options?: LoadOptions): any {
        let result = {}

        // Set default options.
        if (!options) options = {}
        _.defaults(options, {overwrite: true, rootKey: ""})

        // No filenames passed? Load the default ones.
        if (!filenames) {
            filenames = ["settings.default.json", "settings.json", `settings.${env.NODE_ENV}.json`]
        }
        // Make sure we're dealing with array of filenames by default.
        else if (_.isString(filenames)) {
            filenames = [filenames as string]
        }

        for (let filename of filenames) {
            let settingsJson = utils.loadJson(filename, options.crypto)

            // Add file to the `files` list, but only if not loaded previously.
            if (settingsJson != null) {
                if (_.find(this.files, {filename}) == null) {
                    this.files.push({filename, watching: false})
                } else {
                    logger.debug("SetMeUp.load", filename, "Loaded before, so won't add to the files list")
                }
            }

            if (logger) {
                logger.info("SetMeUp.load", filename, "Loaded")
            }

            // Extend loaded settings.
            if (options.rootKey) {
                utils.extend(settingsJson[options.rootKey], result, options.overwrite)
            } else {
                utils.extend(settingsJson, result, options.overwrite)
            }

            // Emit load passing filenames and loaded settings result.
            this.events.emit("load", filename, result)
        }

        // Nothing loaded? Return null.
        if (_.keys(result).length < 1) {
            return null
        }

        // Extend loaded settings.
        utils.extend(result, this.settings, options.overwrite)

        // Return the JSON representation of the loaded settings.
        return result
    }

    /**
     * Reset to default settings by clearing values and listeners, and re-calling `load`.
     */
    reset(): void {
        this.unwatch()
        this.files = []
        this._settings = {}

        this.events.emit("reset")
    }

    // ENCRYPTION
    // --------------------------------------------------------------------------

    /**
     * Encrypts the specified settings file.
     * @param filename The file to be encrypted.
     * @param options Options cipher, key and IV to be passed to the encryptor.
     */
    encrypt(filename: string, options: crypto.CryptoOptions): void {
        const result = JSON.stringify(crypto.CryptoMethod("encrypt", filename, options), null, 4)
        fs.writeFileSync(filename, result, {encoding: "utf8"})
    }

    /**
     * Decrypts the specified settings file.
     * @param filename The file to be decrypted.
     * @param options Options cipher, key and IV to be passed to the decryptor.
     */
    decrypt(filename: string, options: crypto.CryptoOptions): void {
        const result = JSON.stringify(crypto.CryptoMethod("decrypt", filename, options), null, 4)
        fs.writeFileSync(filename, result, {encoding: "utf8"})
    }

    // FILE WATCHER
    // --------------------------------------------------------------------------

    /**
     * Watch loaded settings files for changes by using a file watcher.
     */
    watch(): void {
        // Iterate loaded files to create the file system watchers.
        for (let f of Array.from(this.files)) {
            ;(f => {
                const filename = utils.getFilePath(f.filename)

                if (filename != null && !f.watching) {
                    f.watching = true

                    return fs.watchFile(filename, {persistent: true}, () => {
                        this.load(filename)

                        if (logger) {
                            logger.info("Settings.watch", f, "Reloaded")
                        }
                    })
                }
            })(f)
        }

        if (logger) {
            logger.info("Settings.watch")
        }
    }

    /**
     * Unwatch changes on loaded settings files.
     */
    unwatch() {
        try {
            for (let f of Array.from(this.files)) {
                const filename = utils.getFilePath(f.filename)
                f.watching = false

                if (filename != null) {
                    fs.unwatchFile(filename)
                }
            }
        } catch (ex) {
            if (logger) {
                logger.error("Settings.unwatch", ex)
            }
        }

        if (logger) {
            return logger.info("Settings.unwatch")
        }
    }
}

// Exports...
export = SetMeUp.Instance
