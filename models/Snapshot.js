// Snapshot.js

const mqtt              = require('mqtt');

const Config            = require('./Config');
const SnapshotRequester = require('./SnapshotRequester');

class SnapshotClass {
    constructor() {
        this.mqttSubscribeCheckInterval = null;
        this.triggerTimestamps = {};
        
        this.client = mqtt.connect("mqtt://" + String(Config.mqttBroker.host) + ":" + String(Config.mqttBroker.port),{clientId:"nodeSnapshot"});
        
        this.client.on("connect",function(){	
            console.log("Connected to MQTT broker");            
        });
        this.subscribe(this);
                    
        this.requestDelay = Number.parseInt(String(Config.merakiDashboardApi.snapshotRequestDelaySeconds)) * 1000;
    }
    
    subscribe (self) {
        self.mqttSubscribeCheckInterval = setInterval(function() {
            if (self.client.connected) {
                console.log("Subscribing to MQTT topics:");
                var topics = [];
                
                if (Config.mvSense.subscribeToRawDetections) {
                    for (var i in Config.mvSense.rawDetectionsCameraSerialsList) {
                        topics.push("/merakimv/" + String(Config.mvSense.rawDetectionsCameraSerialsList[i]) + "/raw_detections");
                    }              
                }
                
                if (Config.mvSense.subscribeToZoneTopics) {
                    for (var i in Config.mvSense.zoneTopicsList) {
                        topics.push(String(Config.mvSense.zoneTopicsList[i]));
                    }              
                }
                                    
                if (topics.length > 0) {
                    console.log(topics);
                    self.client.subscribe(topics);
                }
             
                self.client.on('message',function(topic, message, packet){
                    var cameraSerial = self.getCameraSerial(String(topic));
                    
                    if (self.checkTriggerTimestamp(cameraSerial, self)) {
                        var msgObject = JSON.parse(String(message));
                        var timestamp = new Date(msgObject.ts).toISOString();
                        for (var i in msgObject.objects) {
                            if (msgObject.objects[i].type == 'person') {
                                console.log("Person detected by " + cameraSerial + " at " + timestamp);
                                
                                SnapshotRequester.push(cameraSerial, timestamp, SnapshotRequester);
                                
                            }
                            
                            // request and store snapshot                            
                        }
                    }
                });
                
                clearInterval(self.mqttSubscribeCheckInterval);
                self.mqttSubscribeCheckInterval = null;
            }
        }, 1000);
    }
    
    getCameraSerial (topic) {
        return topic.substring(10,24);
    }
    
    checkTriggerTimestamp(serial, self) {
        // Maintains timestamps of when a snapshot request was last sent for a particular camera
        // to limit request frequency.
        if (serial in self.triggerTimestamps) {
            var now = new Date();
            var diff = now - self.triggerTimestamps[serial];
            if (diff > Config.mvSense.minTriggerIntervalSeconds * 1000) {
                self.triggerTimestamps[serial] = new Date();
                return true;
            } else {
                return false;
            }
        } else {
            self.triggerTimestamps[serial] = new Date();
            return true;
        }
    }

} // class DemoClass

var Snapshot = new SnapshotClass();

module.exports = Snapshot;