// Viewer.js

const fs        = require('fs');
const path      = require('path');

const Config    = require('./Config');
const Backend   = require('./Snapshot');

const Meraki    = require('./Meraki');


function findNetworkWithId(id, netList) {
    for (var net of netList) {
        if (net.id == id) {
            return net;
        }
    }
    return null;
}

class ViewerClass {
    constructor () {
        var orgId = String(Config.merakiDashboardApi.organizationId);
        
        var self = this;
    
        this.cameraData = {};
        
        var api = new Meraki.MerakiClass(Config.merakiDashboardApi.apiKey);
        
        api.getOrganizationInventoryDevices (api, orgId)
            .then(function(devResponse){
                var devices = devResponse.data;
                if (devices != null) {
                    api.getOrganizationNetworks (api, orgId)
                        .then(function(netResponse){
                            var networks = netResponse.data;
                            if (networks != null) {
                                for (var dev of devices) {
                                    if (dev.model.startsWith("MV") && dev.networkId != null) {
                                        var net = findNetworkWithId(dev.networkId, networks);
                                        if (net != null) {
                                            self.cameraData[dev.serial] = {
                                                name        : dev.name,
                                                model       : dev.model,
                                                tags        : dev.tags,
                                                networkId   : dev.networkId,
                                                networkName : net.name,
                                                networkTags : net.tags                                                
                                            };                                
                                        }
                                    }
                                }
                            }                            
                        })
                        .catch(function(error){
                            console.log(error);
                        });                    
                }
                
            })
            .catch(function(error){
                console.log(error);               
            });        
                
    }
    
    getAuthSettings() {
        if ('eventViewer' in Config) {
            if (Config.eventViewer.requireAuthentication) {
                return { authenticationRequired: true };
            }            
        }
        return { authenticationRequired: false };
    }
    
    authenticate(username, password) {
        if ( !('eventViewer' in Config) || ! Config.eventViewer.requireAuthentication ) {
            return true;
        }
        for (var i=0;i<Config.users.length;i++) {
            if ( Config.users[i].username == username && Config.users[i].password == password) {
                return true;
            }
        }
        return false;
    }
    
    getEvents() {
        const directoryPath = path.join(__dirname, '../images');
        var self = this;
                
        return new Promise(function (resolve, reject) {
            fs.readdir(directoryPath, function (err, files) {
                //handling error
                if (err) {
                    reject('error');
                } 
                
                var eventList = [];
                
                files.forEach(function (file) {
                    var eventRecord = { imageFileName: file };
                    try {
                        var serial = file.substring(0, 14);
                        var camData = self.cameraData[serial];
                        eventRecord['cameraSerial'] = serial;
                        eventRecord['cameraName']   = camData.name;
                        eventRecord['cameraModel']  = camData.model;
                        eventRecord['cameraTags']   = camData.tags;
                        eventRecord['networkId']    = camData.networkId;
                        eventRecord['networkName']  = camData.networkName;
                        eventRecord['networkTags']  = camData.networkTags;
                        eventRecord['dateTimeIso']  = file.substring(15, 28) + ':' + 
                                                      file.substring(29, 31) + ':' +
                                                      file.substring(32, 39);
                        eventList.push(eventRecord);
                    } catch {
                        console.log('getEvents: Ignoring file "' + file + '"');
                    }
                });
                
                resolve(eventList);
            });        
        });        
    }
    
    getImage(fileName) {
        var imgData = fs.readFileSync('./images/' + fileName, null);
        return imgData;
    }
}

var Viewer = new ViewerClass();

module.exports = Viewer;