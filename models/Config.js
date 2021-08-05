// Config.js

const fs   = require('fs');
const yaml = require('js-yaml');

class ConfigClass {
    constructor() {
                
        const rawConfig = yaml.load(fs.readFileSync('./config/config.yaml', 'utf8'));
        
        for (var item in rawConfig) {
            this[item] = rawConfig[item];
        };
    }
} // class ConfigClass

const Config = new ConfigClass();

module.exports = Config;