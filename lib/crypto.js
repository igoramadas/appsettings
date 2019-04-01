"use strict";
/**
 * SetMeUp: Crypto Helper
 */
Object.defineProperty(exports, "__esModule", { value: true });
const utils = require("./utils");
const child_process_1 = require("child_process");
const _ = require("lodash");
const crypto = require("crypto");
const fs = require("fs");
let logger = null;
try {
    logger = require("anyhow");
}
catch (ex) {
    // Anyhow module not found
}
/** Default IV value in case one is not provided */
let defaultIV = "8407198407191984";
/**
 * Helper to encrypt or decrypt settings files. The default encryption key
 * defined on the `Settings.coffee` file is a static string (see below) , which
 * you should change to your desired value, along with the IV. You can also
 * set them via the SETMEUP_CRYPTOKEY and SETMEUP_CRYPTOIV environment variables.
 * The default cipher algorithm is AES 256.
 * Failure to encrypt or decrypt will throw an exception.
 * @param action Action can be "encrypt" or "decrypt"
 * @param filename The file to be encrypted or decrypted.
 * @param options Encryption options with cipher, key and IV.
 * @returns True if file is encrypted successfully, false (or exception throw) otherwise
 * @protected
 */
function CryptoMethod(action, filename, options) {
    let env = process.env.NODE_ENV || "development";
    if (options == null) {
        options = {};
    }
    action = action.toString().toLowerCase();
    options = _.defaults(options, {
        cipher: "aes256",
        key: env["SETMEUP_CRYPTOKEY"],
        iv: env["SETMEUP_CRYPTOIV"]
    });
    // No encryption key specified? Use the Machine ID then.
    if (!options.key) {
        options.key = getMachineID();
    }
    // No IV specified? Use default (set on top of this file).
    if (!options.iv) {
        options.iv = defaultIV;
    }
    const settingsJson = utils.loadJson(filename);
    // Settings file not found or invalid? Stop here.
    if (settingsJson == null) {
        throw new Error("Can't (de)encrypt, settings file not found or empty.");
    }
    // If trying to encrypt and settings property `encrypted` is true, return false.
    if (settingsJson.encrypted && action == "encrypt" && env != "test") {
        if (logger) {
            logger.warn("Setmeup.CryptoMethod", filename, "Already encrypted, abort!");
        }
        return false;
    }
    // Helper to parse and encrypt / decrypt settings data.
    var parser = obj => {
        let currentValue = null;
        for (let prop in obj) {
            const value = obj[prop];
            if ((value != null ? value.constructor : undefined) === Object) {
                parser(obj[prop]);
            }
            else {
                var newValue;
                try {
                    var c;
                    currentValue = obj[prop];
                    if (action == "encrypt") {
                        // Check the property data type and prefix the new value.
                        if (_.isBoolean(currentValue)) {
                            newValue = "bool:";
                        }
                        else if (_.isNumber(currentValue)) {
                            newValue = "number:";
                        }
                        else {
                            newValue = "string:";
                        }
                        // Create cipher amd encrypt data.
                        c = crypto.createCipheriv(options.cipher, options.key, options.iv);
                        newValue += c.update(currentValue.toString(), "utf8", "hex");
                        newValue += c.final("hex");
                    }
                    else if (action == "decrypt") {
                        // Split the data as "datatype:encryptedValue".
                        const arrValue = currentValue.split(":");
                        newValue = "";
                        // Create cipher and decrypt.
                        c = crypto.createDecipheriv(options.cipher, options.key, options.iv);
                        newValue += c.update(arrValue[1], "hex", "utf8");
                        newValue += c.final("utf8");
                        // Cast data type (boolean, number or string).
                        if (arrValue[0] === "bool") {
                            if (newValue === "true" || newValue === "1") {
                                newValue = true;
                            }
                            else {
                                newValue = false;
                            }
                        }
                        else if (arrValue[0] === "number") {
                            newValue = parseFloat(newValue);
                        }
                    }
                }
                catch (ex) {
                    ex.friendlyMessage = `Can't ${action}: ${currentValue}. Make sure key and IV are correct for encryption.`;
                    throw ex;
                }
                // Update settings property value.
                obj[prop] = newValue;
            }
        }
    };
    // Remove `encrypted` property prior to decrypting.
    if (action == "decrypt") {
        delete settingsJson["encrypted"];
    }
    // Process settings data.
    parser(settingsJson);
    // Add `encrypted` property after file is encrypted.
    if (action == "encrypt") {
        settingsJson.encrypted = true;
    }
    // Stringify and save the new settings file.
    const newSettingsJson = JSON.stringify(settingsJson, null, 4);
    fs.writeFileSync(filename, newSettingsJson, { encoding: "utf8" });
    return true;
}
exports.CryptoMethod = CryptoMethod;
/**
 * Gets a unique machine ID. This is mainly used to get a valid encryption key
 * in case none is specified when encrypting / decrypting.
 * @protected
 */
function getMachineID() {
    let windowsArc = null;
    if (process.arch == "ia32" && process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432")) {
        windowsArc = "mixed";
    }
    else {
        windowsArc = "native";
    }
    let { platform } = process;
    let win32RegBinPath = {
        native: "%windir%\\System32",
        mixed: "%windir%\\sysnative\\cmd.exe /c %windir%\\System32"
    };
    let guid = {
        darwin: "ioreg -rd1 -c IOPlatformExpertDevice",
        win32: `${win32RegBinPath[windowsArc]}\\REG ` + "QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography " + "/v MachineGuid",
        linux: "( cat /var/lib/dbus/machine-id /etc/machine-id 2> /dev/null || hostname ) | head -n 1 || :",
        freebsd: "kenv -q smbios.system.uuid"
    };
    let result = child_process_1.execSync(guid[platform]).toString();
    switch (platform) {
        case "darwin":
            return result
                .split("IOPlatformUUID")[1]
                .split("\n")[0]
                .replace(/\=|\s+|\"/gi, "")
                .toLowerCase()
                .substring(0, 32);
        case "win32":
            return result
                .toString()
                .split("REG_SZ")[1]
                .replace(/\r+|\n+|\s+/gi, "")
                .toLowerCase()
                .substring(0, 32);
        case "linux":
            return result
                .toString()
                .replace(/\r+|\n+|\s+/gi, "")
                .toLowerCase()
                .substring(0, 32);
        case "freebsd":
            return result
                .toString()
                .replace(/\r+|\n+|\s+/gi, "")
                .toLowerCase()
                .substring(0, 32);
        default:
            return "SetMeUp32SettingsEncryptionKey32";
    }
}
