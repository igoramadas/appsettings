# SetMeUp

[![Version](https://img.shields.io/npm/v/setmeup.svg)](https://npmjs.com/package/setmeup)
[![Build Status](https://img.shields.io/travis/igoramadas/setmeup.svg)](https://travis-ci.org/igoramadas/setmeup)
[![Coverage Status](https://img.shields.io/coveralls/igoramadas/setmeup.svg)](https://coveralls.io/github/igoramadas/setmeup?branch=master)

Easy to use app settings module. Settings are stored and loaded from JSON files,
suppoort inline comments and can be (de)encrypted on-the-fly.

## Configuration files

By default SetMeUp will load configuration from 3 different JSON files, on the following order:

1. **settings.default.json** are mainly used by libraries to define their default settings.
2. **settings.json** should usually contain global settings for the current application.
3. **settings.NODE_ENV.json** should have application settings relevant only to the current environment.

A typical application will have at least the `settings.json` file, but most should have at least one
`settings.development.json` and one `settings.production.json` file as well. Most applications
won't have a `settings.default.json` file, as this is mainly used by shared libraries.

The configuration files can have inline comments!

## Basic usage

```javascript
const setmeup = require("setmeup")
const settings = setmeup.settings

// By default it will load from settings.default.json, settings.json and settings.NODE_ENV.json
// automatically. Here we load settings from a custom file as well.
setmeup.load("settings.custom.json")

// Sample server listens to port defined on settings.
myExpressApp.listen(settings.app.port)

// Actual settings can be changed on the fly.
settings.app.title = "My new App Title"
settings.myFTP = {
    host: "myhost.com",
    folder: "/something"
}
```

### Watching updates to configuration files

```javascript
const onLoad = (filename, settingsJson) => {
    console.log(`Settings reloaded from disk: ${filename}`)
    console.dir(settingsJson)
}

// Will get triggered whenever a config file changes.
setmeup.on("load", onLoad)

// Pretend updating files.
myApp.writeConfig("title", "New title")
```

### Encrypting and decrypting files

```javascript
// Derive encryption key from machine (default).
setmeup.encrypt("./settings.private.json")

// And decrypt...
setmeup.decrypt("./settings.private.json")

// Or using a custom key and IV.
let options = {key: "12345678901234561234567890123456", iv: "1234567890987654"}
setmeup.encrypt("./settings.private.json", options)
setmeup.decrypt("./settings.private.json", options)

// You can also load encrypted files by passing the crypto options.
let cryptoOptions = {crypto: options}
setmeup.encrypt("./settings.private.json", options)
setmeup.load("./settings.private.json", cryptoOptions)
```

## Methods

#### load(filename, options) -> object

Loads the specified filename(s). The options are not mandatory:

* **overwrite** overwrite settings in case they were previously set
* **rootKey** root key to be loaded from
* **crypto** in case file is encrypted, set the crypto options

#### reset

Unwatch files and load initial settings again.

## API documentation

You can browse the full API documentation at https://setmeup.devv.com.

Or check these following modules that are using SetMeUp:

* [Expresser](https://github.com/igoramadas/expresser)
* [Monitorado](https://github.com/igoramadas/monitorado)
