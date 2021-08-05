// Meraki_2021-08-05T10.48.57.481001.js

/*
    Meraki Dashboard API SDK module for Node.js
    
    The SDK requires the Axios package: https://www.npmjs.com/package/axios
    
    How to use this module:
    * Copy this module to the same directory as your Node.js code
    * Rename this file to Meraki.js
    * Add the following lines to your code, replacing <api_key> with your Meraki Dashboard API key:
        const Meraki = require('./Meraki');
        var api = new Meraki.MerakiClass("<api_key>");
    * After that, you can use the endpoint methods like in this example:
        api.getOrganizations(api)
            .then(function(response){
                // Code for handling request success
                console.log(response);
            }).catch(function (error) {
                // Code for handling request error
                console.log(error);
            });
            
    How to find endpoints in this file:
    * Go to the Meraki Dashboard API documentation page: https://developer.cisco.com/meraki/api-v1/
    * Find the endpoint that you want to use
    * Copy its Operation Id and locate it in this file using the search function of your text editor
    
    General structure of endpoints in this SDK:
        MerakiClass.<operation_id>(<self>, <url_param_1>, <url_param_2>, <query>, <body>)
        
        These variable parts are present in all endpoints:
        <operation_id>: This is the Operation Id of the endpoint, as specified in the Meraki Dashboard API documentation page
        <self>: The first argument is always your MerakiClass instance. This is needed for the module to work properly 
        
        Depending on the endpoint, it can require additional arguments to function. Refer to the particular endpoint method
        for its additional arguments. They can be the following:
        <url_param_1>, <url_param_2>: The URL of the endpoint you are using might contain variable parts. For example, 
            getOrganizationNetworks requires an organizationId. If needed, these are mandatory
        <query>: If the endpoint you are using has the option to receive additional parameters as a query string, they can
            be provided using this argument object. See example below on how to use it
        <body>: If the endpoint you are using has the option to receive additional parameters as a request body, they can
            be provided using this argument object. See example below on how to use it
            
    Using an endpoint that has query string parameter options:
        const Meraki = require('./Meraki');
        var api = new Meraki.MerakiClass("12345678");
        var serial = "AAAA-BBBB-CCCC";
        var query = { timespan: 10000 };
        api.getDeviceClients(api, serial, query)
            .then(function(response){
                // Code for handling request success
                console.log(response);
            }).catch(function (error) {
                // Code for handling request error
                console.log(error);
            });
            
    Using an endpoint that has request body parameter options:
        const Meraki = require('./Meraki');
        var api = new Meraki.MerakiClass("12345678");
        var organizationId = "87654321";
        var body = { name: "New network" };
        api.createOrganizationNetwork (api, organizationId, body)
            .then(function(response){
                // Code for handling request success
                console.log(response);
            }).catch(function (error) {
                // Code for handling request error
                console.log(error);
            });
        
*/


const DEFAULT_BASE_URL              = "https://api.meraki.com/api/v1";
const DEFAULT_API_REQUEST_TIMEOUT   = 60000; // milliseconds
const DEFAULT_API_KEY               = "6bec40cf957de430a6f1f2baa056b99a4fac9ea0"; // Sandbox API key

const HTTP_STATUS_NOT_FOUND         = 404;
const HTTP_STATUS_RATE_LIMIT        = 429;

const MAX_RESEND_RETRIES            = 10;
const DEFAULT_BACKOFF_MS            = 5000;

const axios = require('axios');

class MerakiClass {
    constructor(apiKey, baseUrl, timeout) {
        var apiKeyBuffer    = DEFAULT_API_KEY; 
        var baseUrlBuffer   = DEFAULT_BASE_URL;    
        var timeoutBuffer   = DEFAULT_API_REQUEST_TIMEOUT;    

        try {
            if (typeof apiKey != "undefined" && apiKey != null) {
                apiKeyBuffer = apiKey.toString();
            }
                   
            if (typeof baseUrl != "undefined" && baseUrl != null) {
                baseUrlBuffer = baseUrl.toString();
            }
                  
            if (typeof timeout != "undefined" && timeout != null) {
                timeoutBuffer = timeout.toString().parseInt()*1000;
            }            
        }
        catch (error) {
            console.log(error);
        }
    
        this.api = axios.create({
                baseURL: baseUrlBuffer,
                timeout: timeoutBuffer, 
                headers: {"X-Cisco-Meraki-API-Key": apiKeyBuffer}
            });
    }
    
    validateMethod(method) {
        const validMethods = ['get', 'put', 'post', 'delete'];
        var methodIsValid = true;
        try {
            var lowerCaseVerb = method.toString().toLowerCase();            
        }
        catch (error) {
            console.log(error);
            methodIsValid = false;
        }
        
        if (methodIsValid) {
            if (!validMethods.includes(lowerCaseVerb)) {
                console.log("Invalid method: " + lowerCaseVerb);
                methodIsValid = false;                    
            }
        }
        return methodIsValid;
    }
    
    formQueryString(queryObject) {
        var result = "";
        if (typeof queryObject != "undefined" && queryObject != null) {
            for (var item in queryObject) {
                if (Array.isArray(queryObject[item])) {
                    var prefix = item + "[]=";
                    for (var i in queryObject[item]) {
                        result = (result == "") ? "?" : result + "&";
                        result = result + prefix + queryObject[item][i].toString();
                    }
                } else {
                    result = (result == "") ? "?" : result + "&";
                    result = result + item + "=" + queryObject[item].toString();
                }
            }
        }
            
        return result;
    }
    
    request(self, method, endpoint, config, retry) { 
        
        return new Promise(function (resolve, reject) {
            
            var methodIsValid = self.validateMethod(method);
            
            if (!methodIsValid) {
                reject({errors: ["Invalid method"]});
            }
            else {                
                var retryNumber = 0;
                if (typeof retry == "number") {
                    retryNumber = retry;
                }
                
                // for retries, etc
                var dataOnlyConfig = null;
                
                var axiosConfig = {
                    url: endpoint,
                    method: method.toString().toLowerCase()
                };
                
                if (typeof config != "undefined" && config != null) {
                    if ("query" in config && config.query != null) {                    
                        axiosConfig.url = axiosConfig.url + self.formQueryString(config.query);
                    }
                    
                    if ("data" in config && config.data != null) {
                        axiosConfig.data = config.data;
                        
                        // for retries, etc
                        dataOnlyConfig = {data: config.data};
                    }
                }
                                
                var returnValues = {
                    success: false,
                    status: HTTP_STATUS_NOT_FOUND,
                    data: null,
                    errors: null
                };
                
                console.log(method.toString().toUpperCase() + " " + axiosConfig.url);
                
                self.api(axiosConfig)
                    .then(function(response) {                        
                        if("link" in response.request.res.headers) {
                            var nextPageNotFound = true;
                            var linkRecord = response.request.res.headers.link.split(", ");
                            for (var i = 0; i < linkRecord.length; i++) {
                                var splitRecord = linkRecord[i].split("; ");
                                if (splitRecord[1] == "rel=next") {
                                    nextPageNotFound = false;
                                    
                                    var nextUrl = splitRecord[0].substring(1, splitRecord[0].length-1);                                    
                                    var nextEndpoint = nextUrl.split("meraki.com/api/v1")[1];
                                                                        
                                    self.request(self, axiosConfig.method, nextEndpoint, dataOnlyConfig, 0)
                                        .then(function(nextResponse) {
                                            var combined = [];
                                            
                                            for (var i in response.data) {
                                                combined.push(response.data[i]);
                                            };
                                            
                                            for (var j in nextResponse.data) {
                                                combined.push(nextResponse.data[j]);
                                            };
                                            
                                            returnValues.success = true;
                                            returnValues.status = nextResponse.status;
                                            returnValues.data = combined;
                                            
                                            resolve(returnValues);   
                                        })
                                        .catch(function(error) {
                                            if ("status" in error) {
                                                returnValues.status = error.status;                                
                                            }
                                            if ("errors" in error) {
                                                returnValues.errors = error.errors;                                
                                            }
                                            reject(returnValues);                                         
                                        });
                                        
                                    break;
                                }         
                            }
                            
                            if (nextPageNotFound) {
                                // this is the FINAL response page
                                returnValues.success = true;
                                returnValues.status = response.request.res.statusCode;
                                returnValues.data = response.data;    
                                resolve(returnValues);
                            }
                        }
                        else {
                            // this is the ONLY response page
                            returnValues.success = true;
                            returnValues.status = response.request.res.statusCode;
                            returnValues.data = response.data;                            
                            resolve(returnValues);                         
                        }
                    })
                    .catch(function(error) {                        
                        if ("response" in error && "status" in error.response && error.response.status == HTTP_STATUS_RATE_LIMIT) {
                            // Hit rate limiter, retry if able
                            
                            retryNumber += 1;
                            if (retryNumber <= MAX_RESEND_RETRIES) {
                                // Still have retries left, back off and resend
                                
                                // https://www.geeksforgeeks.org/how-to-wait-for-a-promise-to-finish-before-returning-the-variable-of-a-function/
                                const wait=ms=>new Promise(resolve => setTimeout(resolve, ms));
                                
                                var backOffTimerMs = DEFAULT_BACKOFF_MS;
                                
                                if ( "retry-after" in error.response.headers) {
                                    backOffTimerMs = error.response.headers["retry-after"]*1000;
                                }
                                console.log("request: Hit API rate limit. Waiting " + backOffTimerMs + "ms before retry");
                                
                                wait(backOffTimerMs).then(() => {
                                    self.request(self, axiosConfig.method, axiosConfig.url, dataOnlyConfig, retryNumber+1)
                                        .then(function(retryResponse){
                                            // Yay, this time it went through. Use response as own response                                            
                                            returnValues.success = true;
                                            returnValues.status = retryResponse.status;
                                            returnValues.data = retryResponse.data;                            
                                            resolve(returnValues); 
                                            
                                        })
                                        .catch(function(retryError){
                                            // Request unsuccessful. Either out of retries or general error. Fail
                                            returnValues.status = retryError.status;
                                            returnValues.errors = retryError.errors;
                                            reject(returnValues);                                            
                                        });
                                }).catch(() => {
                                    console.log("request: Retry wait failed");
                                });                                
                            } else {
                                // Hit max retries, give up
                                returnValues.status = HTTP_STATUS_RATE_LIMIT;
                                returnValues.errors = ["API busy. Max retries reached"];
                                reject(returnValues);    
                            }
                            
                        } else {
                            // Did not hit rate limiter, this is some other error. Do not retry, just fail
                            if ("response" in error) {                                
                                if ("data" in error.response && "errors" in error.response.data) {    
                                    returnValues.errors = error.response.data.errors;                                
                                }        
                                if ("status" in error.response) {
                                    returnValues.status = error.response.status;                                
                                }                        
                            }
                            reject(returnValues);
                        }
                    });                                
            }
        });
    }
    
    
/*
    ////////////////////

    SECTION: ENDPOINT ACCESS METHODS BELOW
    
    ////////////////////
*/
    
    


    // getDevice: Return a single device
    // GET /devices/{serial}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device

    getDevice (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDevice: Update the attributes of a device
    // PUT /devices/{serial}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device

    // Request body schema:
    //   name: String. The name of a device
    //   tags: Array. The list of tags of a device
    //   lat: Number. The latitude of a device
    //   lng: Number. The longitude of a device
    //   address: String. The address of a device
    //   notes: String. The notes for the device. String. Limited to 255 characters.
    //   moveMapMarker: Boolean. Whether or not to set the latitude and longitude of a device based on the new address. Only applies when lat and lng are not specified.
    //   switchProfileId: String. The ID of a switch profile to bind to the device (for available switch profiles, see the 'Switch Profiles' endpoint). Use null to unbind the switch device from the current profile. For a device to be bindable to a switch profile, it must (1) be a switch, and (2) belong to a network that is bound to a configuration template.
    //   floorPlanId: String. The floor plan to associate to this device. null disassociates the device from the floorplan.

    updateDevice (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceApplianceDhcpSubnets: Return the DHCP subnet information for an appliance
    // GET /devices/{serial}/appliance/dhcp/subnets

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-appliance-dhcp-subnets

    getDeviceApplianceDhcpSubnets (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/appliance/dhcp/subnets")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceAppliancePerformance: Return the performance score for a single MX. Only primary MX devices supported. If no data is available, a 204 error code is returned.
    // GET /devices/{serial}/appliance/performance

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-appliance-performance

    getDeviceAppliancePerformance (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/appliance/performance")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // blinkDeviceLeds: Blink the LEDs on a device
    // POST /devices/{serial}/blinkLeds

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!blink-device-leds

    // Request body schema:
    //   duration: Integer. The duration in seconds. Must be between 5 and 120. Default is 20 seconds
    //   period: Integer. The period in milliseconds. Must be between 100 and 1000. Default is 160 milliseconds
    //   duty: Integer. The duty cycle as the percent active. Must be between 10 and 90. Default is 50.

    blinkDeviceLeds (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/devices/" + serial + "/blinkLeds", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraAnalyticsLive: Returns live state from camera of analytics zones
    // GET /devices/{serial}/camera/analytics/live

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-analytics-live

    getDeviceCameraAnalyticsLive (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/analytics/live")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraAnalyticsOverview: Returns an overview of aggregate analytics data for a timespan
    // GET /devices/{serial}/camera/analytics/overview

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-analytics-overview

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days. The default is 1 hour.
    //   objectType: String. [optional] The object type for which analytics will be retrieved. The default object type is person. The available types are [person, vehicle].

    getDeviceCameraAnalyticsOverview (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/analytics/overview", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraAnalyticsRecent: Returns most recent record for analytics zones
    // GET /devices/{serial}/camera/analytics/recent

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-analytics-recent

    // Query parameters:
    //   objectType: String. [optional] The object type for which analytics will be retrieved. The default object type is person. The available types are [person, vehicle].

    getDeviceCameraAnalyticsRecent (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/analytics/recent", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraAnalyticsZones: Returns all configured analytic zones for this camera
    // GET /devices/{serial}/camera/analytics/zones

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-analytics-zones

    getDeviceCameraAnalyticsZones (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/analytics/zones")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraAnalyticsZoneHistory: Return historical records for analytic zones
    // GET /devices/{serial}/camera/analytics/zones/{zoneId}/history

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-analytics-zone-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 14 hours after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 14 hours. The default is 1 hour.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 60. The default is 60.
    //   objectType: String. [optional] The object type for which analytics will be retrieved. The default object type is person. The available types are [person, vehicle].

    getDeviceCameraAnalyticsZoneHistory (self, serial, zoneId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/analytics/zones/" + zoneId + "/history", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // generateDeviceCameraSnapshot: Generate a snapshot of what the camera sees at the specified time and return a link to that image.
    // POST /devices/{serial}/camera/generateSnapshot

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!generate-device-camera-snapshot

    // Request body schema:
    //   timestamp: String. [optional] The snapshot will be taken from this time on the camera. The timestamp is expected to be in ISO 8601 format. If no timestamp is specified, we will assume current time.
    //   fullframe: Boolean. [optional] If set to "true" the snapshot will be taken at full sensor resolution. This will error if used with timestamp.

    generateDeviceCameraSnapshot (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/devices/" + serial + "/camera/generateSnapshot", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraQualityAndRetention: Returns quality and retention settings for the given camera
    // GET /devices/{serial}/camera/qualityAndRetention

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-quality-and-retention

    getDeviceCameraQualityAndRetention (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/qualityAndRetention")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceCameraQualityAndRetention: Update quality and retention settings for the given camera
    // PUT /devices/{serial}/camera/qualityAndRetention

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-camera-quality-and-retention

    // Request body schema:
    //   profileId: String. The ID of a quality and retention profile to assign to the camera. The profile's settings will override all of the per-camera quality and retention settings. If the value of this parameter is null, any existing profile will be unassigned from the camera.
    //   motionBasedRetentionEnabled: Boolean. Boolean indicating if motion-based retention is enabled(true) or disabled(false) on the camera.
    //   audioRecordingEnabled: Boolean. Boolean indicating if audio recording is enabled(true) or disabled(false) on the camera
    //   restrictedBandwidthModeEnabled: Boolean. Boolean indicating if restricted bandwidth is enabled(true) or disabled(false) on the camera. This setting does not apply to MV2 cameras.
    //   quality: String. Quality of the camera. Can be one of 'Standard', 'High' or 'Enhanced'. Not all qualities are supported by every camera model.
    //   resolution: String. Resolution of the camera. Can be one of '1280x720', '1920x1080', '1080x1080' or '2058x2058'. Not all resolutions are supported by every camera model.
    //   motionDetectorVersion: Integer. The version of the motion detector that will be used by the camera. Only applies to Gen 2 cameras. Defaults to v2.

    updateDeviceCameraQualityAndRetention (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/camera/qualityAndRetention", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraSense: Returns sense settings for a given camera
    // GET /devices/{serial}/camera/sense

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-sense

    getDeviceCameraSense (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/sense")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceCameraSense: Update sense settings for the given camera
    // PUT /devices/{serial}/camera/sense

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-camera-sense

    // Request body schema:
    //   senseEnabled: Boolean. Boolean indicating if sense(license) is enabled(true) or disabled(false) on the camera
    //   mqttBrokerId: String. The ID of the MQTT broker to be enabled on the camera. A value of null will disable MQTT on the camera
    //   audioDetection: Object. The details of the audio detection config.
    //   detectionModelId: String. The ID of the object detection model

    updateDeviceCameraSense (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/camera/sense", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraSenseObjectDetectionModels: Returns the MV Sense object detection model list for the given camera
    // GET /devices/{serial}/camera/sense/objectDetectionModels

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-sense-object-detection-models

    getDeviceCameraSenseObjectDetectionModels (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/sense/objectDetectionModels")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraVideoSettings: Returns video settings for the given camera
    // GET /devices/{serial}/camera/video/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-video-settings

    getDeviceCameraVideoSettings (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/video/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceCameraVideoSettings: Update video settings for the given camera
    // PUT /devices/{serial}/camera/video/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-camera-video-settings

    // Request body schema:
    //   externalRtspEnabled: Boolean. Boolean indicating if external rtsp stream is exposed

    updateDeviceCameraVideoSettings (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/camera/video/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraVideoLink: Returns video link to the specified camera. If a timestamp is supplied, it links to that timestamp.
    // GET /devices/{serial}/camera/videoLink

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-video-link

    // Query parameters:
    //   timestamp: String. [optional] The video link will start at this time. The timestamp should be a string in ISO8601 format. If no timestamp is specified, we will assume current time.

    getDeviceCameraVideoLink (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/videoLink", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCameraWirelessProfiles: Returns wireless profile assigned to the given camera
    // GET /devices/{serial}/camera/wirelessProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-camera-wireless-profiles

    getDeviceCameraWirelessProfiles (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/camera/wirelessProfiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceCameraWirelessProfiles: Assign wireless profiles to the given camera. Incremental updates are not supported, all profile assignment need to be supplied at once.
    // PUT /devices/{serial}/camera/wirelessProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-camera-wireless-profiles

    // Request body schema:
    //   ids: Object. The ids of the wireless profile to assign to the given camera

    updateDeviceCameraWirelessProfiles (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/camera/wirelessProfiles", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCellularGatewayLan: Show the LAN Settings of a MG
    // GET /devices/{serial}/cellularGateway/lan

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-cellular-gateway-lan

    getDeviceCellularGatewayLan (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/cellularGateway/lan")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceCellularGatewayLan: Update the LAN Settings for a single MG.
    // PUT /devices/{serial}/cellularGateway/lan

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-cellular-gateway-lan

    // Request body schema:
    //   reservedIpRanges: Array. list of all reserved IP ranges for a single MG
    //   fixedIpAssignments: Array. list of all fixed IP assignments for a single MG

    updateDeviceCellularGatewayLan (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/cellularGateway/lan", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceCellularGatewayPortForwardingRules: Returns the port forwarding rules for a single MG.
    // GET /devices/{serial}/cellularGateway/portForwardingRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-cellular-gateway-port-forwarding-rules

    getDeviceCellularGatewayPortForwardingRules (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/cellularGateway/portForwardingRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceCellularGatewayPortForwardingRules: Updates the port forwarding rules for a single MG.
    // PUT /devices/{serial}/cellularGateway/portForwardingRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-cellular-gateway-port-forwarding-rules

    // Request body schema:
    //   rules: Array. An array of port forwarding params

    updateDeviceCellularGatewayPortForwardingRules (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/cellularGateway/portForwardingRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceClients: List the clients of a device, up to a maximum of a month ago. The usage of each client is returned in kilobytes. If the device is a switch, the switchport is returned; otherwise the switchport field is null.
    // GET /devices/{serial}/clients

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-clients

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.

    getDeviceClients (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/clients", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceLldpCdp: List LLDP and CDP information for a device
    // GET /devices/{serial}/lldpCdp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-lldp-cdp

    getDeviceLldpCdp (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/lldpCdp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceLossAndLatencyHistory: Get the uplink loss percentage and latency in milliseconds, and goodput in kilobits per second for a wired network device.
    // GET /devices/{serial}/lossAndLatencyHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-loss-and-latency-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 60, 600, 3600, 86400. The default is 60.
    //   uplink: String. The WAN uplink used to obtain the requested stats. Valid uplinks are wan1, wan2, cellular. The default is wan1.
    //   ip: String. The destination IP used to obtain the requested stats. This is required.

    getDeviceLossAndLatencyHistory (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/lossAndLatencyHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceManagementInterface: Return the management interface settings for a device
    // GET /devices/{serial}/managementInterface

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-management-interface

    getDeviceManagementInterface (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/managementInterface")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceManagementInterface: Update the management interface settings for a device
    // PUT /devices/{serial}/managementInterface

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-management-interface

    // Request body schema:
    //   wan1: Object. WAN 1 settings
    //   wan2: Object. WAN 2 settings (only for MX devices)

    updateDeviceManagementInterface (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/managementInterface", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // rebootDevice: Reboot a device
    // POST /devices/{serial}/reboot

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!reboot-device

    rebootDevice (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/devices/" + serial + "/reboot")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchPorts: List the switch ports for a switch
    // GET /devices/{serial}/switch/ports

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-ports

    getDeviceSwitchPorts (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/ports")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // cycleDeviceSwitchPorts: Cycle a set of switch ports
    // POST /devices/{serial}/switch/ports/cycle

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!cycle-device-switch-ports

    // Request body schema:
    //   ports: Array. List of switch ports. Example: [1, 2-5, 1_MA-MOD-8X10G_1, 1_MA-MOD-8X10G_2-1_MA-MOD-8X10G_8]

    cycleDeviceSwitchPorts (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/devices/" + serial + "/switch/ports/cycle", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchPortsStatuses: Return the status for all the ports of a switch
    // GET /devices/{serial}/switch/ports/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-ports-statuses

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.

    getDeviceSwitchPortsStatuses (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/ports/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchPortsStatusesPackets: Return the packet counters for all the ports of a switch
    // GET /devices/{serial}/switch/ports/statuses/packets

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-ports-statuses-packets

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 1 day from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 1 day. The default is 1 day.

    getDeviceSwitchPortsStatusesPackets (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/ports/statuses/packets", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchPort: Return a switch port
    // GET /devices/{serial}/switch/ports/{portId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-port

    getDeviceSwitchPort (self, serial, portId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/ports/" + portId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceSwitchPort: Update a switch port
    // PUT /devices/{serial}/switch/ports/{portId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-switch-port

    // Request body schema:
    //   name: String. The name of the switch port
    //   tags: Array. The list of tags of the switch port
    //   enabled: Boolean. The status of the switch port
    //   type: String. The type of the switch port ('trunk' or 'access')
    //   vlan: Integer. The VLAN of the switch port. A null value will clear the value set for trunk ports.
    //   voiceVlan: Integer. The voice VLAN of the switch port. Only applicable to access ports.
    //   allowedVlans: String. The VLANs allowed on the switch port. Only applicable to trunk ports.
    //   poeEnabled: Boolean. The PoE status of the switch port
    //   isolationEnabled: Boolean. The isolation status of the switch port
    //   rstpEnabled: Boolean. The rapid spanning tree protocol status
    //   stpGuard: String. The state of the STP guard ('disabled', 'root guard', 'bpdu guard' or 'loop guard')
    //   linkNegotiation: String. The link speed for the switch port
    //   portScheduleId: String. The ID of the port schedule. A value of null will clear the port schedule.
    //   udld: String. The action to take when Unidirectional Link is detected (Alert only, Enforce). Default configuration is Alert only.
    //   accessPolicyType: String. The type of the access policy of the switch port. Only applicable to access ports. Can be one of 'Open', 'Custom access policy', 'MAC allow list' or 'Sticky MAC allow list'
    //   accessPolicyNumber: Integer. The number of a custom access policy to configure on the switch port. Only applicable when 'accessPolicyType' is 'Custom access policy'
    //   macAllowList: Array. Only devices with MAC addresses specified in this list will have access to this port. Up to 20 MAC addresses can be defined. Only applicable when 'accessPolicyType' is 'MAC allow list'
    //   stickyMacAllowList: Array. The initial list of MAC addresses for sticky Mac allow list. Only applicable when 'accessPolicyType' is 'Sticky MAC allow list'
    //   stickyMacAllowListLimit: Integer. The maximum number of MAC addresses for sticky MAC allow list. Only applicable when 'accessPolicyType' is 'Sticky MAC allow list'
    //   stormControlEnabled: Boolean. The storm control status of the switch port
    //   flexibleStackingEnabled: Boolean. For supported switches (e.g. MS420/MS425), whether or not the port has flexible stacking enabled.

    updateDeviceSwitchPort (self, serial, portId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/switch/ports/" + portId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchRoutingInterfaces: List layer 3 interfaces for a switch
    // GET /devices/{serial}/switch/routing/interfaces

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-routing-interfaces

    getDeviceSwitchRoutingInterfaces (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/routing/interfaces")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createDeviceSwitchRoutingInterface: Create a layer 3 interface for a switch
    // POST /devices/{serial}/switch/routing/interfaces

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-device-switch-routing-interface

    // Request body schema:
    //   name: String. A friendly name or description for the interface or VLAN.
    //   subnet: String. The network that this routed interface is on, in CIDR notation (ex. 10.1.1.0/24).
    //   interfaceIp: String. The IP address this switch will use for layer 3 routing on this VLAN or subnet. This cannot be the same as the switch's management IP.
    //   multicastRouting: String. Enable multicast support if, multicast routing between VLANs is required. Options are, 'disabled', 'enabled' or 'IGMP snooping querier'. Default is 'disabled'.
    //   vlanId: Integer. The VLAN this routed interface is on. VLAN must be between 1 and 4094.
    //   defaultGateway: String. The next hop for any traffic that isn't going to a directly connected subnet or over a static route. This IP address must exist in a subnet with a routed interface.
    //   ospfSettings: Object. The OSPF routing settings of the interface.

    createDeviceSwitchRoutingInterface (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/devices/" + serial + "/switch/routing/interfaces", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchRoutingInterface: Return a layer 3 interface for a switch
    // GET /devices/{serial}/switch/routing/interfaces/{interfaceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-routing-interface

    getDeviceSwitchRoutingInterface (self, serial, interfaceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/routing/interfaces/" + interfaceId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceSwitchRoutingInterface: Update a layer 3 interface for a switch
    // PUT /devices/{serial}/switch/routing/interfaces/{interfaceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-switch-routing-interface

    // Request body schema:
    //   name: String. A friendly name or description for the interface or VLAN.
    //   subnet: String. The network that this routed interface is on, in CIDR notation (ex. 10.1.1.0/24).
    //   interfaceIp: String. The IP address this switch will use for layer 3 routing on this VLAN or subnet. This cannot be the same as the switch's management IP.
    //   multicastRouting: String. Enable multicast support if, multicast routing between VLANs is required. Options are, 'disabled', 'enabled' or 'IGMP snooping querier'.
    //   vlanId: Integer. The VLAN this routed interface is on. VLAN must be between 1 and 4094.
    //   ospfSettings: Object. The OSPF routing settings of the interface.

    updateDeviceSwitchRoutingInterface (self, serial, interfaceId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/switch/routing/interfaces/" + interfaceId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteDeviceSwitchRoutingInterface: Delete a layer 3 interface from the switch
    // DELETE /devices/{serial}/switch/routing/interfaces/{interfaceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-device-switch-routing-interface

    deleteDeviceSwitchRoutingInterface (self, serial, interfaceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/devices/" + serial + "/switch/routing/interfaces/" + interfaceId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchRoutingInterfaceDhcp: Return a layer 3 interface DHCP configuration for a switch
    // GET /devices/{serial}/switch/routing/interfaces/{interfaceId}/dhcp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-routing-interface-dhcp

    getDeviceSwitchRoutingInterfaceDhcp (self, serial, interfaceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/routing/interfaces/" + interfaceId + "/dhcp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceSwitchRoutingInterfaceDhcp: Update a layer 3 interface DHCP configuration for a switch
    // PUT /devices/{serial}/switch/routing/interfaces/{interfaceId}/dhcp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-switch-routing-interface-dhcp

    // Request body schema:
    //   dhcpMode: String. The DHCP mode options for the switch interface ('dhcpDisabled', 'dhcpRelay' or 'dhcpServer')
    //   dhcpRelayServerIps: Array. The DHCP relay server IPs to which DHCP packets would get relayed for the switch interface
    //   dhcpLeaseTime: String. The DHCP lease time config for the dhcp server running on switch interface ('30 minutes', '1 hour', '4 hours', '12 hours', '1 day' or '1 week')
    //   dnsNameserversOption: String. The DHCP name server option for the dhcp server running on the switch interface ('googlePublicDns', 'openDns' or 'custom')
    //   dnsCustomNameservers: Array. The DHCP name server IPs when DHCP name server option is 'custom'
    //   bootOptionsEnabled: Boolean. Enable DHCP boot options to provide PXE boot options configs for the dhcp server running on the switch interface
    //   bootNextServer: String. The PXE boot server IP for the DHCP server running on the switch interface
    //   bootFileName: String. The PXE boot server filename for the DHCP server running on the switch interface
    //   dhcpOptions: Array. Array of DHCP options consisting of code, type and value for the DHCP server running on the switch interface
    //   reservedIpRanges: Array. Array of DHCP reserved IP assignments for the DHCP server running on the switch interface
    //   fixedIpAssignments: Array. Array of DHCP fixed IP assignments for the DHCP server running on the switch interface

    updateDeviceSwitchRoutingInterfaceDhcp (self, serial, interfaceId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/switch/routing/interfaces/" + interfaceId + "/dhcp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchRoutingStaticRoutes: List layer 3 static routes for a switch
    // GET /devices/{serial}/switch/routing/staticRoutes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-routing-static-routes

    getDeviceSwitchRoutingStaticRoutes (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/routing/staticRoutes")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createDeviceSwitchRoutingStaticRoute: Create a layer 3 static route for a switch
    // POST /devices/{serial}/switch/routing/staticRoutes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-device-switch-routing-static-route

    // Request body schema:
    //   name: String. Name or description for layer 3 static route
    //   subnet: String. The subnet which is routed via this static route and should be specified in CIDR notation (ex. 1.2.3.0/24)
    //   nextHopIp: String. IP address of the next hop device to which the device sends its traffic for the subnet
    //   advertiseViaOspfEnabled: Boolean. Option to advertise static route via OSPF
    //   preferOverOspfRoutesEnabled: Boolean. Option to prefer static route over OSPF routes

    createDeviceSwitchRoutingStaticRoute (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/devices/" + serial + "/switch/routing/staticRoutes", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchRoutingStaticRoute: Return a layer 3 static route for a switch
    // GET /devices/{serial}/switch/routing/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-routing-static-route

    getDeviceSwitchRoutingStaticRoute (self, serial, staticRouteId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/routing/staticRoutes/" + staticRouteId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceSwitchRoutingStaticRoute: Update a layer 3 static route for a switch
    // PUT /devices/{serial}/switch/routing/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-switch-routing-static-route

    // Request body schema:
    //   name: String. Name or description for layer 3 static route
    //   subnet: String. The subnet which is routed via this static route and should be specified in CIDR notation (ex. 1.2.3.0/24)
    //   nextHopIp: String. IP address of the next hop device to which the device sends its traffic for the subnet
    //   advertiseViaOspfEnabled: Boolean. Option to advertise static route via OSPF
    //   preferOverOspfRoutesEnabled: Boolean. Option to prefer static route over OSPF routes

    updateDeviceSwitchRoutingStaticRoute (self, serial, staticRouteId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/switch/routing/staticRoutes/" + staticRouteId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteDeviceSwitchRoutingStaticRoute: Delete a layer 3 static route for a switch
    // DELETE /devices/{serial}/switch/routing/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-device-switch-routing-static-route

    deleteDeviceSwitchRoutingStaticRoute (self, serial, staticRouteId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/devices/" + serial + "/switch/routing/staticRoutes/" + staticRouteId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceSwitchWarmSpare: Return warm spare configuration for a switch
    // GET /devices/{serial}/switch/warmSpare

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-switch-warm-spare

    getDeviceSwitchWarmSpare (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/switch/warmSpare")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceSwitchWarmSpare: Update warm spare configuration for a switch. The spare will use the same L3 configuration as the primary. Note that this will irreversibly destroy any existing L3 configuration on the spare.
    // PUT /devices/{serial}/switch/warmSpare

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-switch-warm-spare

    // Request body schema:
    //   enabled: Boolean. Enable or disable warm spare for a switch
    //   spareSerial: String. Serial number of the warm spare switch

    updateDeviceSwitchWarmSpare (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/switch/warmSpare", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceWirelessBluetoothSettings: Return the bluetooth settings for a wireless device
    // GET /devices/{serial}/wireless/bluetooth/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-wireless-bluetooth-settings

    getDeviceWirelessBluetoothSettings (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/wireless/bluetooth/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceWirelessBluetoothSettings: Update the bluetooth settings for a wireless device
    // PUT /devices/{serial}/wireless/bluetooth/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-wireless-bluetooth-settings

    // Request body schema:
    //   uuid: String. Desired UUID of the beacon. If the value is set to null it will reset to Dashboard's automatically generated value.
    //   major: Integer. Desired major value of the beacon. If the value is set to null it will reset to Dashboard's automatically generated value.
    //   minor: Integer. Desired minor value of the beacon. If the value is set to null it will reset to Dashboard's automatically generated value.

    updateDeviceWirelessBluetoothSettings (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/wireless/bluetooth/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceWirelessConnectionStats: Aggregated connectivity info for a given AP on this network
    // GET /devices/{serial}/wireless/connectionStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-wireless-connection-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag

    getDeviceWirelessConnectionStats (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/wireless/connectionStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceWirelessLatencyStats: Aggregated latency info for a given AP on this network
    // GET /devices/{serial}/wireless/latencyStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-wireless-latency-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag
    //   fields: String. Partial selection: If present, this call will return only the selected fields of ["rawDistribution", "avg"]. All fields will be returned by default. Selected fields must be entered as a comma separated string.

    getDeviceWirelessLatencyStats (self, serial, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/wireless/latencyStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceWirelessRadioSettings: Return the radio settings of a device
    // GET /devices/{serial}/wireless/radio/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-wireless-radio-settings

    getDeviceWirelessRadioSettings (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/wireless/radio/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateDeviceWirelessRadioSettings: Update the radio settings of a device
    // PUT /devices/{serial}/wireless/radio/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-device-wireless-radio-settings

    // Request body schema:
    //   rfProfileId: Integer. The ID of an RF profile to assign to the device. If the value of this parameter is null, the appropriate basic RF profile (indoor or outdoor) will be assigned to the device. Assigning an RF profile will clear ALL manually configured overrides on the device (channel width, channel, power).
    //   twoFourGhzSettings: Object. Manual radio settings for 2.4 GHz.
    //   fiveGhzSettings: Object. Manual radio settings for 5 GHz.

    updateDeviceWirelessRadioSettings (self, serial, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/devices/" + serial + "/wireless/radio/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getDeviceWirelessStatus: Return the SSID statuses of an access point
    // GET /devices/{serial}/wireless/status

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-device-wireless-status

    getDeviceWirelessStatus (self, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/devices/" + serial + "/wireless/status")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetwork: Return a network
    // GET /networks/{networkId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network

    getNetwork (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetwork: Update a network
    // PUT /networks/{networkId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network

    // Request body schema:
    //   name: String. The name of the network
    //   timeZone: String. The timezone of the network. For a list of allowed timezones, please see the 'TZ' column in the table in <a target='_blank' href='https://en.wikipedia.org/wiki/List_of_tz_database_time_zones'>this article.</a>
    //   tags: Array. A list of tags to be applied to the network
    //   enrollmentString: String. A unique identifier which can be used for device enrollment or easy access through the Meraki SM Registration page or the Self Service Portal. Please note that changing this field may cause existing bookmarks to break.
    //   notes: String. Add any notes or additional information about this network here.

    updateNetwork (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetwork: Delete a network
    // DELETE /networks/{networkId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network

    deleteNetwork (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkAlertsSettings: Return the alert configuration for this network
    // GET /networks/{networkId}/alerts/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-alerts-settings

    getNetworkAlertsSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/alerts/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkAlertsSettings: Update the alert configuration for this network
    // PUT /networks/{networkId}/alerts/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-alerts-settings

    // Request body schema:
    //   defaultDestinations: Object. The network-wide destinations for all alerts on the network.
    //   alerts: Array. Alert-specific configuration for each type. Only alerts that pertain to the network can be updated.

    updateNetworkAlertsSettings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/alerts/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceClientSecurityEvents: List the security events for a client. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/appliance/clients/{clientId}/security/events

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-client-security-events

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. Data is gathered after the specified t0 value. The maximum lookback period is 791 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 791 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 791 days. The default is 31 days.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 100.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   sortOrder: String. Sorted order of security events based on event detection time. Order options are 'ascending' or 'descending'. Default is ascending order.

    getNetworkApplianceClientSecurityEvents (self, networkId, clientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/clients/" + clientId + "/security/events", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceConnectivityMonitoringDestinations: Return the connectivity testing destinations for an MX network
    // GET /networks/{networkId}/appliance/connectivityMonitoringDestinations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-connectivity-monitoring-destinations

    getNetworkApplianceConnectivityMonitoringDestinations (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/connectivityMonitoringDestinations")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceConnectivityMonitoringDestinations: Update the connectivity testing destinations for an MX network
    // PUT /networks/{networkId}/appliance/connectivityMonitoringDestinations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-connectivity-monitoring-destinations

    // Request body schema:
    //   destinations: Array. The list of connectivity monitoring destinations

    updateNetworkApplianceConnectivityMonitoringDestinations (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/connectivityMonitoringDestinations", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceContentFiltering: Return the content filtering settings for an MX network
    // GET /networks/{networkId}/appliance/contentFiltering

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-content-filtering

    getNetworkApplianceContentFiltering (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/contentFiltering")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceContentFiltering: Update the content filtering settings for an MX network
    // PUT /networks/{networkId}/appliance/contentFiltering

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-content-filtering

    // Request body schema:
    //   allowedUrlPatterns: Array. A list of URL patterns that are allowed
    //   blockedUrlPatterns: Array. A list of URL patterns that are blocked
    //   blockedUrlCategories: Array. A list of URL categories to block
    //   urlCategoryListSize: String. URL category list size which is either 'topSites' or 'fullList'

    updateNetworkApplianceContentFiltering (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/contentFiltering", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceContentFilteringCategories: List all available content filtering categories for an MX network
    // GET /networks/{networkId}/appliance/contentFiltering/categories

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-content-filtering-categories

    getNetworkApplianceContentFilteringCategories (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/contentFiltering/categories")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallCellularFirewallRules: Return the cellular firewall rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/cellularFirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-cellular-firewall-rules

    getNetworkApplianceFirewallCellularFirewallRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/cellularFirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallCellularFirewallRules: Update the cellular firewall rules of an MX network
    // PUT /networks/{networkId}/appliance/firewall/cellularFirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-cellular-firewall-rules

    // Request body schema:
    //   rules: Array. An ordered array of the firewall rules (not including the default rule)

    updateNetworkApplianceFirewallCellularFirewallRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/cellularFirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallFirewalledServices: List the appliance services and their accessibility rules
    // GET /networks/{networkId}/appliance/firewall/firewalledServices

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-firewalled-services

    getNetworkApplianceFirewallFirewalledServices (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/firewalledServices")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallFirewalledService: Return the accessibility settings of the given service ('ICMP', 'web', or 'SNMP')
    // GET /networks/{networkId}/appliance/firewall/firewalledServices/{service}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-firewalled-service

    getNetworkApplianceFirewallFirewalledService (self, networkId, service) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/firewalledServices/" + service)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallFirewalledService: Updates the accessibility settings for the given service ('ICMP', 'web', or 'SNMP')
    // PUT /networks/{networkId}/appliance/firewall/firewalledServices/{service}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-firewalled-service

    // Request body schema:
    //   access: String. A string indicating the rule for which IPs are allowed to use the specified service. Acceptable values are "blocked" (no remote IPs can access the service), "restricted" (only allowed IPs can access the service), and "unrestriced" (any remote IP can access the service). This field is required
    //   allowedIps: Array. An array of allowed IPs that can access the service. This field is required if "access" is set to "restricted". Otherwise this field is ignored

    updateNetworkApplianceFirewallFirewalledService (self, networkId, service, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/firewalledServices/" + service, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallInboundFirewallRules: Return the inbound firewall rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/inboundFirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-inbound-firewall-rules

    getNetworkApplianceFirewallInboundFirewallRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/inboundFirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallInboundFirewallRules: Update the inbound firewall rules of an MX network
    // PUT /networks/{networkId}/appliance/firewall/inboundFirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-inbound-firewall-rules

    // Request body schema:
    //   rules: Array. An ordered array of the firewall rules (not including the default rule)
    //   syslogDefaultRule: Boolean. Log the special default rule (boolean value - enable only if you've configured a syslog server) (optional)

    updateNetworkApplianceFirewallInboundFirewallRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/inboundFirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallL3FirewallRules: Return the L3 firewall rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/l3FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-l3-firewall-rules

    getNetworkApplianceFirewallL3FirewallRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/l3FirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallL3FirewallRules: Update the L3 firewall rules of an MX network
    // PUT /networks/{networkId}/appliance/firewall/l3FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-l3-firewall-rules

    // Request body schema:
    //   rules: Array. An ordered array of the firewall rules (not including the default rule)
    //   syslogDefaultRule: Boolean. Log the special default rule (boolean value - enable only if you've configured a syslog server) (optional)

    updateNetworkApplianceFirewallL3FirewallRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/l3FirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallL7FirewallRules: List the MX L7 firewall rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/l7FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-l7-firewall-rules

    getNetworkApplianceFirewallL7FirewallRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/l7FirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallL7FirewallRules: Update the MX L7 firewall rules for an MX network
    // PUT /networks/{networkId}/appliance/firewall/l7FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-l7-firewall-rules

    // Request body schema:
    //   rules: Array. An ordered array of the MX L7 firewall rules

    updateNetworkApplianceFirewallL7FirewallRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/l7FirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallL7FirewallRulesApplicationCategories: Return the L7 firewall application categories and their associated applications for an MX network
    // GET /networks/{networkId}/appliance/firewall/l7FirewallRules/applicationCategories

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-l7-firewall-rules-application-categories

    getNetworkApplianceFirewallL7FirewallRulesApplicationCategories (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/l7FirewallRules/applicationCategories")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallOneToManyNatRules: Return the 1:Many NAT mapping rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/oneToManyNatRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-one-to-many-nat-rules

    getNetworkApplianceFirewallOneToManyNatRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/oneToManyNatRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallOneToManyNatRules: Set the 1:Many NAT mapping rules for an MX network
    // PUT /networks/{networkId}/appliance/firewall/oneToManyNatRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-one-to-many-nat-rules

    // Request body schema:
    //   rules: Array. An array of 1:Many nat rules

    updateNetworkApplianceFirewallOneToManyNatRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/oneToManyNatRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallOneToOneNatRules: Return the 1:1 NAT mapping rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/oneToOneNatRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-one-to-one-nat-rules

    getNetworkApplianceFirewallOneToOneNatRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/oneToOneNatRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallOneToOneNatRules: Set the 1:1 NAT mapping rules for an MX network
    // PUT /networks/{networkId}/appliance/firewall/oneToOneNatRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-one-to-one-nat-rules

    // Request body schema:
    //   rules: Array. An array of 1:1 nat rules

    updateNetworkApplianceFirewallOneToOneNatRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/oneToOneNatRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceFirewallPortForwardingRules: Return the port forwarding rules for an MX network
    // GET /networks/{networkId}/appliance/firewall/portForwardingRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-firewall-port-forwarding-rules

    getNetworkApplianceFirewallPortForwardingRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/firewall/portForwardingRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceFirewallPortForwardingRules: Update the port forwarding rules for an MX network
    // PUT /networks/{networkId}/appliance/firewall/portForwardingRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-firewall-port-forwarding-rules

    // Request body schema:
    //   rules: Array. An array of port forwarding params

    updateNetworkApplianceFirewallPortForwardingRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/firewall/portForwardingRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkAppliancePorts: List per-port VLAN settings for all ports of a MX.
    // GET /networks/{networkId}/appliance/ports

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-ports

    getNetworkAppliancePorts (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/ports")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkAppliancePort: Return per-port VLAN settings for a single MX port.
    // GET /networks/{networkId}/appliance/ports/{portId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-port

    getNetworkAppliancePort (self, networkId, portId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/ports/" + portId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkAppliancePort: Update the per-port VLAN settings for a single MX port.
    // PUT /networks/{networkId}/appliance/ports/{portId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-port

    // Request body schema:
    //   enabled: Boolean. The status of the port
    //   dropUntaggedTraffic: Boolean. Trunk port can Drop all Untagged traffic. When true, no VLAN is required. Access ports cannot have dropUntaggedTraffic set to true.
    //   type: String. The type of the port: 'access' or 'trunk'.
    //   vlan: Integer. Native VLAN when the port is in Trunk mode. Access VLAN when the port is in Access mode.
    //   allowedVlans: String. Comma-delimited list of the VLAN ID's allowed on the port, or 'all' to permit all VLAN's on the port.
    //   accessPolicy: String. The name of the policy. Only applicable to Access ports. Valid values are: 'open', '8021x-radius', 'mac-radius', 'hybris-radius' for MX64 or Z3 or any MX supporting the per port authentication feature. Otherwise, 'open' is the only valid value and 'open' is the default value if the field is missing.

    updateNetworkAppliancePort (self, networkId, portId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/ports/" + portId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceSecurityEvents: List the security events for a network
    // GET /networks/{networkId}/appliance/security/events

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-security-events

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. Data is gathered after the specified t0 value. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 365 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 365 days. The default is 31 days.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 100.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   sortOrder: String. Sorted order of security events based on event detection time. Order options are 'ascending' or 'descending'. Default is ascending order.

    getNetworkApplianceSecurityEvents (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/security/events", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceSecurityIntrusion: Returns all supported intrusion settings for an MX network
    // GET /networks/{networkId}/appliance/security/intrusion

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-security-intrusion

    getNetworkApplianceSecurityIntrusion (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/security/intrusion")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceSecurityIntrusion: Set the supported intrusion settings for an MX network
    // PUT /networks/{networkId}/appliance/security/intrusion

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-security-intrusion

    // Request body schema:
    //   mode: String. Set mode to 'disabled'/'detection'/'prevention' (optional - omitting will leave current config unchanged)
    //   idsRulesets: String. Set the detection ruleset 'connectivity'/'balanced'/'security' (optional - omitting will leave current config unchanged). Default value is 'balanced' if none currently saved
    //   protectedNetworks: Object. Set the included/excluded networks from the intrusion engine (optional - omitting will leave current config unchanged). This is available only in 'passthrough' mode

    updateNetworkApplianceSecurityIntrusion (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/security/intrusion", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceSecurityMalware: Returns all supported malware settings for an MX network
    // GET /networks/{networkId}/appliance/security/malware

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-security-malware

    getNetworkApplianceSecurityMalware (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/security/malware")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceSecurityMalware: Set the supported malware settings for an MX network
    // PUT /networks/{networkId}/appliance/security/malware

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-security-malware

    // Request body schema:
    //   mode: String. Set mode to 'enabled' to enable malware prevention, otherwise 'disabled'
    //   allowedUrls: Array. The urls that should be permitted by the malware detection engine. If omitted, the current config will remain unchanged. This is available only if your network supports AMP allow listing
    //   allowedFiles: Array. The sha256 digests of files that should be permitted by the malware detection engine. If omitted, the current config will remain unchanged. This is available only if your network supports AMP allow listing

    updateNetworkApplianceSecurityMalware (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/security/malware", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceSettings: Return the appliance settings for a network
    // GET /networks/{networkId}/appliance/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-settings

    getNetworkApplianceSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceSingleLan: Return single LAN configuration
    // GET /networks/{networkId}/appliance/singleLan

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-single-lan

    getNetworkApplianceSingleLan (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/singleLan")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceSingleLan: Update single LAN configuration
    // PUT /networks/{networkId}/appliance/singleLan

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-single-lan

    // Request body schema:
    //   subnet: String. The subnet of the single LAN configuration
    //   applianceIp: String. The appliance IP address of the single LAN

    updateNetworkApplianceSingleLan (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/singleLan", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceStaticRoutes: List the static routes for an MX or teleworker network
    // GET /networks/{networkId}/appliance/staticRoutes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-static-routes

    getNetworkApplianceStaticRoutes (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/staticRoutes")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkApplianceStaticRoute: Add a static route for an MX or teleworker network
    // POST /networks/{networkId}/appliance/staticRoutes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-appliance-static-route

    // Request body schema:
    //   name: String. The name of the new static route
    //   subnet: String. The subnet of the static route
    //   gatewayIp: String. The gateway IP (next hop) of the static route

    createNetworkApplianceStaticRoute (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/appliance/staticRoutes", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceStaticRoute: Return a static route for an MX or teleworker network
    // GET /networks/{networkId}/appliance/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-static-route

    getNetworkApplianceStaticRoute (self, networkId, staticRouteId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/staticRoutes/" + staticRouteId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceStaticRoute: Update a static route for an MX or teleworker network
    // PUT /networks/{networkId}/appliance/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-static-route

    // Request body schema:
    //   name: String. The name of the static route
    //   subnet: String. The subnet of the static route
    //   gatewayIp: String. The gateway IP (next hop) of the static route
    //   enabled: Boolean. The enabled state of the static route
    //   fixedIpAssignments: Object. The DHCP fixed IP assignments on the static route. This should be an object that contains mappings from MAC addresses to objects that themselves each contain "ip" and "name" string fields. See the sample request/response for more details.
    //   reservedIpRanges: Array. The DHCP reserved IP ranges on the static route

    updateNetworkApplianceStaticRoute (self, networkId, staticRouteId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/staticRoutes/" + staticRouteId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkApplianceStaticRoute: Delete a static route from an MX or teleworker network
    // DELETE /networks/{networkId}/appliance/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-appliance-static-route

    deleteNetworkApplianceStaticRoute (self, networkId, staticRouteId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/appliance/staticRoutes/" + staticRouteId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceTrafficShaping: Display the traffic shaping settings for an MX network
    // GET /networks/{networkId}/appliance/trafficShaping

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-traffic-shaping

    getNetworkApplianceTrafficShaping (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/trafficShaping")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceTrafficShaping: Update the traffic shaping settings for an MX network
    // PUT /networks/{networkId}/appliance/trafficShaping

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-traffic-shaping

    // Request body schema:
    //   globalBandwidthLimits: Object. Global per-client bandwidth limit

    updateNetworkApplianceTrafficShaping (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/trafficShaping", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceTrafficShapingCustomPerformanceClasses: List all custom performance classes for an MX network
    // GET /networks/{networkId}/appliance/trafficShaping/customPerformanceClasses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-traffic-shaping-custom-performance-classes

    getNetworkApplianceTrafficShapingCustomPerformanceClasses (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/trafficShaping/customPerformanceClasses")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkApplianceTrafficShapingCustomPerformanceClass: Add a custom performance class for an MX network
    // POST /networks/{networkId}/appliance/trafficShaping/customPerformanceClasses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-appliance-traffic-shaping-custom-performance-class

    // Request body schema:
    //   name: String. Name of the custom performance class
    //   maxLatency: Integer. Maximum latency in milliseconds
    //   maxJitter: Integer. Maximum jitter in milliseconds
    //   maxLossPercentage: Integer. Maximum percentage of packet loss

    createNetworkApplianceTrafficShapingCustomPerformanceClass (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/appliance/trafficShaping/customPerformanceClasses", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceTrafficShapingCustomPerformanceClass: Return a custom performance class for an MX network
    // GET /networks/{networkId}/appliance/trafficShaping/customPerformanceClasses/{customPerformanceClassId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-traffic-shaping-custom-performance-class

    getNetworkApplianceTrafficShapingCustomPerformanceClass (self, networkId, customPerformanceClassId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/trafficShaping/customPerformanceClasses/" + customPerformanceClassId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceTrafficShapingCustomPerformanceClass: Update a custom performance class for an MX network
    // PUT /networks/{networkId}/appliance/trafficShaping/customPerformanceClasses/{customPerformanceClassId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-traffic-shaping-custom-performance-class

    // Request body schema:
    //   name: String. Name of the custom performance class
    //   maxLatency: Integer. Maximum latency in milliseconds
    //   maxJitter: Integer. Maximum jitter in milliseconds
    //   maxLossPercentage: Integer. Maximum percentage of packet loss

    updateNetworkApplianceTrafficShapingCustomPerformanceClass (self, networkId, customPerformanceClassId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/trafficShaping/customPerformanceClasses/" + customPerformanceClassId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkApplianceTrafficShapingCustomPerformanceClass: Delete a custom performance class from an MX network
    // DELETE /networks/{networkId}/appliance/trafficShaping/customPerformanceClasses/{customPerformanceClassId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-appliance-traffic-shaping-custom-performance-class

    deleteNetworkApplianceTrafficShapingCustomPerformanceClass (self, networkId, customPerformanceClassId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/appliance/trafficShaping/customPerformanceClasses/" + customPerformanceClassId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceTrafficShapingRules: Update the traffic shaping settings rules for an MX network
    // PUT /networks/{networkId}/appliance/trafficShaping/rules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-traffic-shaping-rules

    // Request body schema:
    //   defaultRulesEnabled: Boolean. Whether default traffic shaping rules are enabled (true) or disabled (false). There are 4 default rules, which can be seen on your network's traffic shaping page. Note that default rules count against the rule limit of 8.
    //   rules: Array.     An array of traffic shaping rules. Rules are applied in the order that     they are specified in. An empty list (or null) means no rules. Note that     you are allowed a maximum of 8 rules. 

    updateNetworkApplianceTrafficShapingRules (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/trafficShaping/rules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceTrafficShapingRules: Display the traffic shaping settings rules for an MX network
    // GET /networks/{networkId}/appliance/trafficShaping/rules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-traffic-shaping-rules

    getNetworkApplianceTrafficShapingRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/trafficShaping/rules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceTrafficShapingUplinkBandwidth: Returns the uplink bandwidth settings for your MX network.
    // GET /networks/{networkId}/appliance/trafficShaping/uplinkBandwidth

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-traffic-shaping-uplink-bandwidth

    getNetworkApplianceTrafficShapingUplinkBandwidth (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/trafficShaping/uplinkBandwidth")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceTrafficShapingUplinkBandwidth: Updates the uplink bandwidth settings for your MX network.
    // PUT /networks/{networkId}/appliance/trafficShaping/uplinkBandwidth

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-traffic-shaping-uplink-bandwidth

    // Request body schema:
    //   bandwidthLimits: Object. A mapping of uplinks to their bandwidth settings (be sure to check which uplinks are supported for your network)

    updateNetworkApplianceTrafficShapingUplinkBandwidth (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/trafficShaping/uplinkBandwidth", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceTrafficShapingUplinkSelection: Show uplink selection settings for an MX network
    // GET /networks/{networkId}/appliance/trafficShaping/uplinkSelection

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-traffic-shaping-uplink-selection

    getNetworkApplianceTrafficShapingUplinkSelection (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/trafficShaping/uplinkSelection")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceTrafficShapingUplinkSelection: Update uplink selection settings for an MX network
    // PUT /networks/{networkId}/appliance/trafficShaping/uplinkSelection

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-traffic-shaping-uplink-selection

    // Request body schema:
    //   activeActiveAutoVpnEnabled: Boolean. Toggle for enabling or disabling active-active AutoVPN
    //   defaultUplink: String. The default uplink. Must be one of: 'wan1' or 'wan2'
    //   loadBalancingEnabled: Boolean. Toggle for enabling or disabling load balancing
    //   wanTrafficUplinkPreferences: Array. Array of uplink preference rules for WAN traffic
    //   vpnTrafficUplinkPreferences: Array. Array of uplink preference rules for VPN traffic

    updateNetworkApplianceTrafficShapingUplinkSelection (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/trafficShaping/uplinkSelection", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceUplinksUsageHistory: Get the sent and received bytes for each uplink of a network.
    // GET /networks/{networkId}/appliance/uplinks/usageHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-uplinks-usage-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 14 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 14 days. The default is 10 minutes.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 60, 300, 600, 1800, 3600, 86400. The default is 60.

    getNetworkApplianceUplinksUsageHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/uplinks/usageHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceVlans: List the VLANs for an MX network
    // GET /networks/{networkId}/appliance/vlans

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-vlans

    getNetworkApplianceVlans (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/vlans")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkApplianceVlan: Add a VLAN
    // POST /networks/{networkId}/appliance/vlans

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-appliance-vlan

    // Request body schema:
    //   id: String. The VLAN ID of the new VLAN (must be between 1 and 4094)
    //   name: String. The name of the new VLAN
    //   subnet: String. The subnet of the VLAN
    //   applianceIp: String. The local IP of the appliance on the VLAN
    //   groupPolicyId: String. The id of the desired group policy to apply to the VLAN

    createNetworkApplianceVlan (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/appliance/vlans", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceVlansSettings: Returns the enabled status of VLANs for the network
    // GET /networks/{networkId}/appliance/vlans/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-vlans-settings

    getNetworkApplianceVlansSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/vlans/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceVlansSettings: Enable/Disable VLANs for the given network
    // PUT /networks/{networkId}/appliance/vlans/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-vlans-settings

    // Request body schema:
    //   vlansEnabled: Boolean. Boolean indicating whether to enable (true) or disable (false) VLANs for the network

    updateNetworkApplianceVlansSettings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/vlans/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceVlan: Return a VLAN
    // GET /networks/{networkId}/appliance/vlans/{vlanId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-vlan

    getNetworkApplianceVlan (self, networkId, vlanId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/vlans/" + vlanId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceVlan: Update a VLAN
    // PUT /networks/{networkId}/appliance/vlans/{vlanId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-vlan

    // Request body schema:
    //   name: String. The name of the VLAN
    //   subnet: String. The subnet of the VLAN
    //   applianceIp: String. The local IP of the appliance on the VLAN
    //   groupPolicyId: String. The id of the desired group policy to apply to the VLAN
    //   vpnNatSubnet: String. The translated VPN subnet if VPN and VPN subnet translation are enabled on the VLAN
    //   dhcpHandling: String. The appliance's handling of DHCP requests on this VLAN. One of: 'Run a DHCP server', 'Relay DHCP to another server' or 'Do not respond to DHCP requests'
    //   dhcpRelayServerIps: Array. The IPs of the DHCP servers that DHCP requests should be relayed to
    //   dhcpLeaseTime: String. The term of DHCP leases if the appliance is running a DHCP server on this VLAN. One of: '30 minutes', '1 hour', '4 hours', '12 hours', '1 day' or '1 week'
    //   dhcpBootOptionsEnabled: Boolean. Use DHCP boot options specified in other properties
    //   dhcpBootNextServer: String. DHCP boot option to direct boot clients to the server to load the boot file from
    //   dhcpBootFilename: String. DHCP boot option for boot filename
    //   fixedIpAssignments: Object. The DHCP fixed IP assignments on the VLAN. This should be an object that contains mappings from MAC addresses to objects that themselves each contain "ip" and "name" string fields. See the sample request/response for more details.
    //   reservedIpRanges: Array. The DHCP reserved IP ranges on the VLAN
    //   dnsNameservers: String. The DNS nameservers used for DHCP responses, either "upstream_dns", "google_dns", "opendns", or a newline seperated string of IP addresses or domain names
    //   dhcpOptions: Array. The list of DHCP options that will be included in DHCP responses. Each object in the list should have "code", "type", and "value" properties.

    updateNetworkApplianceVlan (self, networkId, vlanId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/vlans/" + vlanId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkApplianceVlan: Delete a VLAN from a network
    // DELETE /networks/{networkId}/appliance/vlans/{vlanId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-appliance-vlan

    deleteNetworkApplianceVlan (self, networkId, vlanId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/appliance/vlans/" + vlanId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceVpnBgp: Return a Hub BGP Configuration
    // GET /networks/{networkId}/appliance/vpn/bgp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-vpn-bgp

    getNetworkApplianceVpnBgp (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/vpn/bgp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceVpnBgp: Update a Hub BGP Configuration
    // PUT /networks/{networkId}/appliance/vpn/bgp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-vpn-bgp

    // Request body schema:
    //   enabled: Boolean. Boolean value to enable or disable the BGP configuration. When BGP is enabled, the asNumber (ASN) will be autopopulated with the preconfigured ASN at other Hubs or a default value if there is no ASN configured.
    //   asNumber: Integer. An Autonomous System Number (ASN) is required if you are to run BGP and peer with another BGP Speaker outside of the Auto VPN domain. This ASN will be applied to the entire Auto VPN domain. The entire 4-byte ASN range is supported. So, the ASN must be an integer between 1 and 4294967295. When absent, this field is not updated. If no value exists then it defaults to 64512.
    //   ibgpHoldTimer: Integer. The IBGP holdtimer in seconds. The IBGP holdtimer must be an integer between 12 and 240. When absent, this field is not updated. If no value exists then it defaults to 240.
    //   neighbors: Array. List of BGP neighbors. This list replaces the existing set of neighbors. When absent, this field is not updated.

    updateNetworkApplianceVpnBgp (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/vpn/bgp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceVpnSiteToSiteVpn: Return the site-to-site VPN settings of a network. Only valid for MX networks.
    // GET /networks/{networkId}/appliance/vpn/siteToSiteVpn

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-vpn-site-to-site-vpn

    getNetworkApplianceVpnSiteToSiteVpn (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/vpn/siteToSiteVpn")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceVpnSiteToSiteVpn: Update the site-to-site VPN settings of a network. Only valid for MX networks in NAT mode.
    // PUT /networks/{networkId}/appliance/vpn/siteToSiteVpn

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-vpn-site-to-site-vpn

    // Request body schema:
    //   mode: String. The site-to-site VPN mode. Can be one of 'none', 'spoke' or 'hub'
    //   hubs: Array. The list of VPN hubs, in order of preference. In spoke mode, at least 1 hub is required.
    //   subnets: Array. The list of subnets and their VPN presence.

    updateNetworkApplianceVpnSiteToSiteVpn (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/vpn/siteToSiteVpn", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkApplianceWarmSpare: Return MX warm spare settings
    // GET /networks/{networkId}/appliance/warmSpare

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-appliance-warm-spare

    getNetworkApplianceWarmSpare (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/appliance/warmSpare")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkApplianceWarmSpare: Update MX warm spare settings
    // PUT /networks/{networkId}/appliance/warmSpare

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-appliance-warm-spare

    // Request body schema:
    //   enabled: Boolean. Enable warm spare
    //   spareSerial: String. Serial number of the warm spare appliance
    //   uplinkMode: String. Uplink mode, either virtual or public
    //   virtualIp1: String. The WAN 1 shared IP
    //   virtualIp2: String. The WAN 2 shared IP

    updateNetworkApplianceWarmSpare (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/appliance/warmSpare", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // swapNetworkApplianceWarmSpare: Swap MX primary and warm spare appliances
    // POST /networks/{networkId}/appliance/warmSpare/swap

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!swap-network-appliance-warm-spare

    swapNetworkApplianceWarmSpare (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/appliance/warmSpare/swap")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // bindNetwork: Bind a network to a template.
    // POST /networks/{networkId}/bind

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!bind-network

    // Request body schema:
    //   configTemplateId: String. The ID of the template to which the network should be bound.
    //   autoBind: Boolean. Optional boolean indicating whether the network's switches should automatically bind to profiles of the same model. Defaults to false if left unspecified. This option only affects switch networks and switch templates. Auto-bind is not valid unless the switch template has at least one profile and has at most one profile per switch model.

    bindNetwork (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/bind", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkBluetoothClients: List the Bluetooth clients seen by APs in this network
    // GET /networks/{networkId}/bluetoothClients

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-bluetooth-clients

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 7 days from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 7 days. The default is 1 day.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 5 - 1000. Default is 10.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   includeConnectivityHistory: Boolean. Include the connectivity history for this client

    getNetworkBluetoothClients (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/bluetoothClients", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkBluetoothClient: Return a Bluetooth client. Bluetooth clients can be identified by their ID or their MAC.
    // GET /networks/{networkId}/bluetoothClients/{bluetoothClientId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-bluetooth-client

    // Query parameters:
    //   includeConnectivityHistory: Boolean. Include the connectivity history for this client
    //   connectivityHistoryTimespan: Integer. The timespan, in seconds, for the connectivityHistory data. By default 1 day, 86400, will be used.

    getNetworkBluetoothClient (self, networkId, bluetoothClientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/bluetoothClients/" + bluetoothClientId, { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCameraQualityRetentionProfiles: List the quality retention profiles for this network
    // GET /networks/{networkId}/camera/qualityRetentionProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-camera-quality-retention-profiles

    getNetworkCameraQualityRetentionProfiles (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/camera/qualityRetentionProfiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkCameraQualityRetentionProfile: Creates new quality retention profile for this network.
    // POST /networks/{networkId}/camera/qualityRetentionProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-camera-quality-retention-profile

    // Request body schema:
    //   name: String. The name of the new profile. Must be unique. This parameter is required.
    //   motionBasedRetentionEnabled: Boolean. Deletes footage older than 3 days in which no motion was detected. Can be either true or false. Defaults to false. This setting does not apply to MV2 cameras.
    //   restrictedBandwidthModeEnabled: Boolean. Disable features that require additional bandwidth such as Motion Recap. Can be either true or false. Defaults to false. This setting does not apply to MV2 cameras.
    //   audioRecordingEnabled: Boolean. Whether or not to record audio. Can be either true or false. Defaults to false.
    //   cloudArchiveEnabled: Boolean. Create redundant video backup using Cloud Archive. Can be either true or false. Defaults to false.
    //   motionDetectorVersion: Integer. The version of the motion detector that will be used by the camera. Only applies to Gen 2 cameras. Defaults to v2.
    //   scheduleId: String. Schedule for which this camera will record video, or 'null' to always record.
    //   maxRetentionDays: Integer. The maximum number of days for which the data will be stored, or 'null' to keep data until storage space runs out. If the former, it can be one of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 30, 60, 90] days.
    //   videoSettings: Object. Video quality and resolution settings for all the camera models.

    createNetworkCameraQualityRetentionProfile (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/camera/qualityRetentionProfiles", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCameraQualityRetentionProfile: Retrieve a single quality retention profile
    // GET /networks/{networkId}/camera/qualityRetentionProfiles/{qualityRetentionProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-camera-quality-retention-profile

    getNetworkCameraQualityRetentionProfile (self, networkId, qualityRetentionProfileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/camera/qualityRetentionProfiles/" + qualityRetentionProfileId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkCameraQualityRetentionProfile: Update an existing quality retention profile for this network.
    // PUT /networks/{networkId}/camera/qualityRetentionProfiles/{qualityRetentionProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-camera-quality-retention-profile

    // Request body schema:
    //   name: String. The name of the new profile. Must be unique.
    //   motionBasedRetentionEnabled: Boolean. Deletes footage older than 3 days in which no motion was detected. Can be either true or false. Defaults to false. This setting does not apply to MV2 cameras.
    //   restrictedBandwidthModeEnabled: Boolean. Disable features that require additional bandwidth such as Motion Recap. Can be either true or false. Defaults to false. This setting does not apply to MV2 cameras.
    //   audioRecordingEnabled: Boolean. Whether or not to record audio. Can be either true or false. Defaults to false.
    //   cloudArchiveEnabled: Boolean. Create redundant video backup using Cloud Archive. Can be either true or false. Defaults to false.
    //   motionDetectorVersion: Integer. The version of the motion detector that will be used by the camera. Only applies to Gen 2 cameras. Defaults to v2.
    //   scheduleId: String. Schedule for which this camera will record video, or 'null' to always record.
    //   maxRetentionDays: Integer. The maximum number of days for which the data will be stored, or 'null' to keep data until storage space runs out. If the former, it can be one of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 30, 60, 90] days.
    //   videoSettings: Object. Video quality and resolution settings for all the camera models.

    updateNetworkCameraQualityRetentionProfile (self, networkId, qualityRetentionProfileId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/camera/qualityRetentionProfiles/" + qualityRetentionProfileId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkCameraQualityRetentionProfile: Delete an existing quality retention profile for this network.
    // DELETE /networks/{networkId}/camera/qualityRetentionProfiles/{qualityRetentionProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-camera-quality-retention-profile

    deleteNetworkCameraQualityRetentionProfile (self, networkId, qualityRetentionProfileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/camera/qualityRetentionProfiles/" + qualityRetentionProfileId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCameraSchedules: Returns a list of all camera recording schedules.
    // GET /networks/{networkId}/camera/schedules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-camera-schedules

    getNetworkCameraSchedules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/camera/schedules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkCameraWirelessProfile: Creates a new camera wireless profile for this network.
    // POST /networks/{networkId}/camera/wirelessProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-camera-wireless-profile

    // Request body schema:
    //   name: String. The name of the camera wireless profile. This parameter is required.
    //   ssid: Object. The details of the SSID config.
    //   identity: Object. The identity of the wireless profile. Required for creating wireless profiles in 8021x-radius auth mode.

    createNetworkCameraWirelessProfile (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/camera/wirelessProfiles", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCameraWirelessProfiles: List the camera wireless profiles for this network.
    // GET /networks/{networkId}/camera/wirelessProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-camera-wireless-profiles

    getNetworkCameraWirelessProfiles (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/camera/wirelessProfiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCameraWirelessProfile: Retrieve a single camera wireless profile.
    // GET /networks/{networkId}/camera/wirelessProfiles/{wirelessProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-camera-wireless-profile

    getNetworkCameraWirelessProfile (self, networkId, wirelessProfileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/camera/wirelessProfiles/" + wirelessProfileId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkCameraWirelessProfile: Update an existing camera wireless profile in this network.
    // PUT /networks/{networkId}/camera/wirelessProfiles/{wirelessProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-camera-wireless-profile

    // Request body schema:
    //   name: String. The name of the camera wireless profile.
    //   ssid: Object. The details of the SSID config.
    //   identity: Object. The identity of the wireless profile. Required for creating wireless profiles in 8021x-radius auth mode.

    updateNetworkCameraWirelessProfile (self, networkId, wirelessProfileId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/camera/wirelessProfiles/" + wirelessProfileId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkCameraWirelessProfile: Delete an existing camera wireless profile for this network.
    // DELETE /networks/{networkId}/camera/wirelessProfiles/{wirelessProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-camera-wireless-profile

    deleteNetworkCameraWirelessProfile (self, networkId, wirelessProfileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/camera/wirelessProfiles/" + wirelessProfileId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCellularGatewayConnectivityMonitoringDestinations: Return the connectivity testing destinations for an MG network
    // GET /networks/{networkId}/cellularGateway/connectivityMonitoringDestinations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-cellular-gateway-connectivity-monitoring-destinations

    getNetworkCellularGatewayConnectivityMonitoringDestinations (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/cellularGateway/connectivityMonitoringDestinations")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkCellularGatewayConnectivityMonitoringDestinations: Update the connectivity testing destinations for an MG network
    // PUT /networks/{networkId}/cellularGateway/connectivityMonitoringDestinations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-cellular-gateway-connectivity-monitoring-destinations

    // Request body schema:
    //   destinations: Array. The list of connectivity monitoring destinations

    updateNetworkCellularGatewayConnectivityMonitoringDestinations (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/cellularGateway/connectivityMonitoringDestinations", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCellularGatewayDhcp: List common DHCP settings of MGs
    // GET /networks/{networkId}/cellularGateway/dhcp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-cellular-gateway-dhcp

    getNetworkCellularGatewayDhcp (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/cellularGateway/dhcp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkCellularGatewayDhcp: Update common DHCP settings of MGs
    // PUT /networks/{networkId}/cellularGateway/dhcp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-cellular-gateway-dhcp

    // Request body schema:
    //   dhcpLeaseTime: String. DHCP Lease time for all MG of the network. It can be '30 minutes', '1 hour', '4 hours', '12 hours', '1 day' or '1 week'.
    //   dnsNameservers: String. DNS name servers mode for all MG of the network. It can take 4 different values: 'upstream_dns', 'google_dns', 'opendns', 'custom'.
    //   dnsCustomNameservers: Array. list of fixed IP representing the the DNS Name servers when the mode is 'custom'

    updateNetworkCellularGatewayDhcp (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/cellularGateway/dhcp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCellularGatewaySubnetPool: Return the subnet pool and mask configured for MGs in the network.
    // GET /networks/{networkId}/cellularGateway/subnetPool

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-cellular-gateway-subnet-pool

    getNetworkCellularGatewaySubnetPool (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/cellularGateway/subnetPool")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkCellularGatewaySubnetPool: Update the subnet pool and mask configuration for MGs in the network.
    // PUT /networks/{networkId}/cellularGateway/subnetPool

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-cellular-gateway-subnet-pool

    // Request body schema:
    //   mask: Integer. Mask used for the subnet of all MGs in  this network.
    //   cidr: String. CIDR of the pool of subnets. Each MG in this network will automatically pick a subnet from this pool.

    updateNetworkCellularGatewaySubnetPool (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/cellularGateway/subnetPool", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkCellularGatewayUplink: Returns the uplink settings for your MG network.
    // GET /networks/{networkId}/cellularGateway/uplink

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-cellular-gateway-uplink

    getNetworkCellularGatewayUplink (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/cellularGateway/uplink")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkCellularGatewayUplink: Updates the uplink settings for your MG network.
    // PUT /networks/{networkId}/cellularGateway/uplink

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-cellular-gateway-uplink

    // Request body schema:
    //   bandwidthLimits: Object. The bandwidth settings for the 'cellular' uplink

    updateNetworkCellularGatewayUplink (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/cellularGateway/uplink", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClients: List the clients that have used this network in the timespan
    // GET /networks/{networkId}/clients

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-clients

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 10.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   statuses: Array. Filters clients based on status. Can be one of 'Online' or 'Offline'.
    //   ip: String. Filters clients based on a partial or full match for the ip address field.
    //   ip6: String. Filters clients based on a partial or full match for the ip6 address field.
    //   ip6Local: String. Filters clients based on a partial or full match for the ip6Local address field.
    //   mac: String. Filters clients based on a partial or full match for the mac address field.
    //   os: String. Filters clients based on a partial or full match for the os (operating system) field.
    //   description: String. Filters clients based on a partial or full match for the description field.
    //   recentDeviceConnections: Array. Filters clients based on recent connection type. Can be one of 'Wired' or 'Wireless'.

    getNetworkClients (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientsApplicationUsage: Return the application usage data for clients. Usage data is in kilobytes. Clients can be identified by client keys or either the MACs or IPs depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/applicationUsage

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-clients-application-usage

    // Query parameters:
    //   clients: String. A list of client keys, MACs or IPs separated by comma.
    //   ssidNumber: Integer. An SSID number to include. If not specified, eveusage histories application usagents for all SSIDs will be returned.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.

    getNetworkClientsApplicationUsage (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/applicationUsage", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientsOverview: Return overview statistics for network clients
    // GET /networks/{networkId}/clients/overview

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-clients-overview

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 7200, 86400, 604800, 2592000. The default is 604800.

    getNetworkClientsOverview (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/overview", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // provisionNetworkClients: Provisions a client with a name and policy. Clients can be provisioned before they associate to the network.
    // POST /networks/{networkId}/clients/provision

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!provision-network-clients

    // Request body schema:
    //   clients: Array. The array of clients to provision
    //   devicePolicy: String. The policy to apply to the specified client. Can be 'Group policy', 'Allowed', 'Blocked', 'Per connection' or 'Normal'. Required.
    //   groupPolicyId: String. The ID of the desired group policy to apply to the client. Required if 'devicePolicy' is set to "Group policy". Otherwise this is ignored.
    //   policiesBySecurityAppliance: Object. An object, describing what the policy-connection association is for the security appliance. (Only relevant if the security appliance is actually within the network)
    //   policiesBySsid: Object. An object, describing the policy-connection associations for each active SSID within the network. Keys should be the number of enabled SSIDs, mapping to an object describing the client's policy

    provisionNetworkClients (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/clients/provision", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientsUsageHistories: Return the usage histories for clients. Usage data is in kilobytes. Clients can be identified by client keys or either the MACs or IPs depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/usageHistories

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-clients-usage-histories

    // Query parameters:
    //   clients: String. A list of client keys, MACs or IPs separated by comma.
    //   ssidNumber: Integer. An SSID number to include. If not specified, events for all SSIDs will be returned.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.

    getNetworkClientsUsageHistories (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/usageHistories", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClient: Return the client associated with the given identifier. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/{clientId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-client

    getNetworkClient (self, networkId, clientId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/" + clientId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientPolicy: Return the policy assigned to a client on the network. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/{clientId}/policy

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-client-policy

    getNetworkClientPolicy (self, networkId, clientId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/" + clientId + "/policy")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkClientPolicy: Update the policy assigned to a client on the network. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // PUT /networks/{networkId}/clients/{clientId}/policy

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-client-policy

    // Request body schema:
    //   devicePolicy: String. The policy to assign. Can be 'Whitelisted', 'Blocked', 'Normal' or 'Group policy'. Required.
    //   groupPolicyId: String. [optional] If 'devicePolicy' is set to 'Group policy' this param is used to specify the group policy ID.

    updateNetworkClientPolicy (self, networkId, clientId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/clients/" + clientId + "/policy", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientSplashAuthorizationStatus: Return the splash authorization for a client, for each SSID they've associated with through splash. Only enabled SSIDs with Click-through splash enabled will be included. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/{clientId}/splashAuthorizationStatus

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-client-splash-authorization-status

    getNetworkClientSplashAuthorizationStatus (self, networkId, clientId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/" + clientId + "/splashAuthorizationStatus")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkClientSplashAuthorizationStatus: Update a client's splash authorization. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // PUT /networks/{networkId}/clients/{clientId}/splashAuthorizationStatus

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-client-splash-authorization-status

    // Request body schema:
    //   ssids: Object. The target SSIDs. Each SSID must be enabled and must have Click-through splash enabled. For each SSID where isAuthorized is true, the expiration time will automatically be set according to the SSID's splash frequency. Not all networks support configuring all SSIDs

    updateNetworkClientSplashAuthorizationStatus (self, networkId, clientId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/clients/" + clientId + "/splashAuthorizationStatus", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientTrafficHistory: Return the client's network traffic data over time. Usage data is in kilobytes. This endpoint requires detailed traffic analysis to be enabled on the Network-wide > General page. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/{clientId}/trafficHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-client-traffic-history

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkClientTrafficHistory (self, networkId, clientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/" + clientId + "/trafficHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkClientUsageHistory: Return the client's daily usage history. Usage data is in kilobytes. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP.
    // GET /networks/{networkId}/clients/{clientId}/usageHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-client-usage-history

    getNetworkClientUsageHistory (self, networkId, clientId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/clients/" + clientId + "/usageHistory")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkDevices: List the devices in a network
    // GET /networks/{networkId}/devices

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-devices

    getNetworkDevices (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/devices")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // claimNetworkDevices: Claim devices into a network. (Note: for recently claimed devices, it may take a few minutes for API requsts against that device to succeed)
    // POST /networks/{networkId}/devices/claim

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!claim-network-devices

    // Request body schema:
    //   serials: Array. A list of serials of devices to claim

    claimNetworkDevices (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/devices/claim", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // removeNetworkDevices: Remove a single device
    // POST /networks/{networkId}/devices/remove

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!remove-network-devices

    // Request body schema:
    //   serial: String. The serial of a device

    removeNetworkDevices (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/devices/remove", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkEvents: List the events for the network
    // GET /networks/{networkId}/events

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-events

    // Query parameters:
    //   productType: String. The product type to fetch events for. This parameter is required for networks with multiple device types. Valid types are wireless, appliance, switch, systemsManager, camera, and cellularGateway
    //   includedEventTypes: Array. A list of event types. The returned events will be filtered to only include events with these types.
    //   excludedEventTypes: Array. A list of event types. The returned events will be filtered to exclude events with these types.
    //   deviceMac: String. The MAC address of the Meraki device which the list of events will be filtered with
    //   deviceSerial: String. The serial of the Meraki device which the list of events will be filtered with
    //   deviceName: String. The name of the Meraki device which the list of events will be filtered with
    //   clientIp: String. The IP of the client which the list of events will be filtered with. Only supported for track-by-IP networks.
    //   clientMac: String. The MAC address of the client which the list of events will be filtered with. Only supported for track-by-MAC networks.
    //   clientName: String. The name, or partial name, of the client which the list of events will be filtered with
    //   smDeviceMac: String. The MAC address of the Systems Manager device which the list of events will be filtered with
    //   smDeviceName: String. The name of the Systems Manager device which the list of events will be filtered with
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 10.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkEvents (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/events", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkEventsEventTypes: List the event type to human-readable description
    // GET /networks/{networkId}/events/eventTypes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-events-event-types

    getNetworkEventsEventTypes (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/events/eventTypes")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkFirmwareUpgrades: Get firmware upgrade information for a network
    // GET /networks/{networkId}/firmwareUpgrades

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-firmware-upgrades

    getNetworkFirmwareUpgrades (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/firmwareUpgrades")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkFirmwareUpgrades: Update firmware upgrade information for a network
    // PUT /networks/{networkId}/firmwareUpgrades

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-firmware-upgrades

    // Request body schema:
    //   upgradeWindow: Object. Upgrade window for devices in network
    //   timezone: String. The timezone for the network
    //   products: Object. Contains information about the network to update

    updateNetworkFirmwareUpgrades (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/firmwareUpgrades", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkFirmwareUpgradesRollback: Rollback a Firmware Upgrade For A Network
    // POST /networks/{networkId}/firmwareUpgrades/rollbacks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-firmware-upgrades-rollback

    // Request body schema:
    //   product: String. Product type to rollback (if the network is a combined network)
    //   time: String. Scheduled time for the rollback
    //   reasons: Array. Reasons for the rollback
    //   toVersion: Object. Version to downgrade to (if the network has firmware flexibility)

    createNetworkFirmwareUpgradesRollback (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/firmwareUpgrades/rollbacks", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkFloorPlans: List the floor plans that belong to your network
    // GET /networks/{networkId}/floorPlans

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-floor-plans

    getNetworkFloorPlans (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/floorPlans")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkFloorPlan: Upload a floor plan
    // POST /networks/{networkId}/floorPlans

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-floor-plan

    // Request body schema:
    //   name: String. The name of your floor plan.
    //   center: Object. The longitude and latitude of the center of your floor plan. The 'center' or two adjacent corners (e.g. 'topLeftCorner' and 'bottomLeftCorner') must be specified. If 'center' is specified, the floor plan is placed over that point with no rotation. If two adjacent corners are specified, the floor plan is rotated to line up with the two specified points. The aspect ratio of the floor plan's image is preserved regardless of which corners/center are specified. (This means if that more than two corners are specified, only two corners may be used to preserve the floor plan's aspect ratio.). No two points can have the same latitude, longitude pair.
    //   bottomLeftCorner: Object. The longitude and latitude of the bottom left corner of your floor plan.
    //   bottomRightCorner: Object. The longitude and latitude of the bottom right corner of your floor plan.
    //   topLeftCorner: Object. The longitude and latitude of the top left corner of your floor plan.
    //   topRightCorner: Object. The longitude and latitude of the top right corner of your floor plan.
    //   imageContents: String. The file contents (a base 64 encoded string) of your image. Supported formats are PNG, GIF, and JPG. Note that all images are saved as PNG files, regardless of the format they are uploaded in.

    createNetworkFloorPlan (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/floorPlans", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkFloorPlan: Find a floor plan by ID
    // GET /networks/{networkId}/floorPlans/{floorPlanId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-floor-plan

    getNetworkFloorPlan (self, networkId, floorPlanId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/floorPlans/" + floorPlanId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkFloorPlan: Update a floor plan's geolocation and other meta data
    // PUT /networks/{networkId}/floorPlans/{floorPlanId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-floor-plan

    // Request body schema:
    //   name: String. The name of your floor plan.
    //   center: Object. The longitude and latitude of the center of your floor plan. If you want to change the geolocation data of your floor plan, either the 'center' or two adjacent corners (e.g. 'topLeftCorner' and 'bottomLeftCorner') must be specified. If 'center' is specified, the floor plan is placed over that point with no rotation. If two adjacent corners are specified, the floor plan is rotated to line up with the two specified points. The aspect ratio of the floor plan's image is preserved regardless of which corners/center are specified. (This means if that more than two corners are specified, only two corners may be used to preserve the floor plan's aspect ratio.). No two points can have the same latitude, longitude pair.
    //   bottomLeftCorner: Object. The longitude and latitude of the bottom left corner of your floor plan.
    //   bottomRightCorner: Object. The longitude and latitude of the bottom right corner of your floor plan.
    //   topLeftCorner: Object. The longitude and latitude of the top left corner of your floor plan.
    //   topRightCorner: Object. The longitude and latitude of the top right corner of your floor plan.
    //   imageContents: String. The file contents (a base 64 encoded string) of your new image. Supported formats are PNG, GIF, and JPG. Note that all images are saved as PNG files, regardless of the format they are uploaded in. If you upload a new image, and you do NOT specify any new geolocation fields ('center, 'topLeftCorner', etc), the floor plan will be recentered with no rotation in order to maintain the aspect ratio of your new image.

    updateNetworkFloorPlan (self, networkId, floorPlanId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/floorPlans/" + floorPlanId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkFloorPlan: Destroy a floor plan
    // DELETE /networks/{networkId}/floorPlans/{floorPlanId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-floor-plan

    deleteNetworkFloorPlan (self, networkId, floorPlanId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/floorPlans/" + floorPlanId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkGroupPolicies: List the group policies in a network
    // GET /networks/{networkId}/groupPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-group-policies

    getNetworkGroupPolicies (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/groupPolicies")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkGroupPolicy: Create a group policy
    // POST /networks/{networkId}/groupPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-group-policy

    // Request body schema:
    //   name: String. The name for your group policy. Required.
    //   scheduling: Object.     The schedule for the group policy. Schedules are applied to days of the week. 
    //   bandwidth: Object.     The bandwidth settings for clients bound to your group policy. 
    //   firewallAndTrafficShaping: Object.     The firewall and traffic shaping rules and settings for your policy. 
    //   contentFiltering: Object. The content filtering settings for your group policy
    //   splashAuthSettings: String. Whether clients bound to your policy will bypass splash authorization or behave according to the network's rules. Can be one of 'network default' or 'bypass'. Only available if your network has a wireless configuration.
    //   vlanTagging: Object. The VLAN tagging settings for your group policy. Only available if your network has a wireless configuration.
    //   bonjourForwarding: Object. The Bonjour settings for your group policy. Only valid if your network has a wireless configuration.

    createNetworkGroupPolicy (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/groupPolicies", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkGroupPolicy: Display a group policy
    // GET /networks/{networkId}/groupPolicies/{groupPolicyId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-group-policy

    getNetworkGroupPolicy (self, networkId, groupPolicyId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/groupPolicies/" + groupPolicyId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkGroupPolicy: Update a group policy
    // PUT /networks/{networkId}/groupPolicies/{groupPolicyId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-group-policy

    // Request body schema:
    //   name: String. The name for your group policy.
    //   scheduling: Object.     The schedule for the group policy. Schedules are applied to days of the week. 
    //   bandwidth: Object.     The bandwidth settings for clients bound to your group policy. 
    //   firewallAndTrafficShaping: Object.     The firewall and traffic shaping rules and settings for your policy. 
    //   contentFiltering: Object. The content filtering settings for your group policy
    //   splashAuthSettings: String. Whether clients bound to your policy will bypass splash authorization or behave according to the network's rules. Can be one of 'network default' or 'bypass'. Only available if your network has a wireless configuration.
    //   vlanTagging: Object. The VLAN tagging settings for your group policy. Only available if your network has a wireless configuration.
    //   bonjourForwarding: Object. The Bonjour settings for your group policy. Only valid if your network has a wireless configuration.

    updateNetworkGroupPolicy (self, networkId, groupPolicyId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/groupPolicies/" + groupPolicyId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkGroupPolicy: Delete a group policy
    // DELETE /networks/{networkId}/groupPolicies/{groupPolicyId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-group-policy

    deleteNetworkGroupPolicy (self, networkId, groupPolicyId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/groupPolicies/" + groupPolicyId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkInsightApplicationHealthByTime: Get application health by time
    // GET /networks/{networkId}/insight/applications/{applicationId}/healthByTime

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-insight-application-health-by-time

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 7 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days. The default is 2 hours.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 60, 300, 3600, 86400. The default is 300.

    getNetworkInsightApplicationHealthByTime (self, networkId, applicationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/insight/applications/" + applicationId + "/healthByTime", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkMerakiAuthUsers: List the users configured under Meraki Authentication for a network (splash guest or RADIUS users for a wireless network, or client VPN users for a wired network)
    // GET /networks/{networkId}/merakiAuthUsers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-meraki-auth-users

    getNetworkMerakiAuthUsers (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/merakiAuthUsers")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkMerakiAuthUser: Authorize a user configured with Meraki Authentication for a network (currently supports 802.1X, splash guest, and client VPN users, and currently, organizations have a 50,000 user cap)
    // POST /networks/{networkId}/merakiAuthUsers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-meraki-auth-user

    // Request body schema:
    //   email: String. Email address of the user
    //   name: String. Name of the user
    //   password: String. The password for this user account
    //   accountType: String. Authorization type for user. Can be 'Guest' or '802.1X' for wireless networks, or 'Client VPN' for wired networks. Defaults to '802.1X'.
    //   emailPasswordToUser: Boolean. Whether or not Meraki should email the password to user. Default is false.
    //   authorizations: Array. Authorization zones and expiration dates for the user.

    createNetworkMerakiAuthUser (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/merakiAuthUsers", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkMerakiAuthUser: Return the Meraki Auth splash guest, RADIUS, or client VPN user
    // GET /networks/{networkId}/merakiAuthUsers/{merakiAuthUserId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-meraki-auth-user

    getNetworkMerakiAuthUser (self, networkId, merakiAuthUserId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/merakiAuthUsers/" + merakiAuthUserId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkMerakiAuthUser: Deauthorize a user. To reauthorize a user after deauthorizing them, POST to this endpoint. (Currently, 802.1X RADIUS, splash guest, and client VPN users can be deauthorized.)
    // DELETE /networks/{networkId}/merakiAuthUsers/{merakiAuthUserId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-meraki-auth-user

    deleteNetworkMerakiAuthUser (self, networkId, merakiAuthUserId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/merakiAuthUsers/" + merakiAuthUserId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkMerakiAuthUser: Update a user configured with Meraki Authentication (currently, 802.1X RADIUS, splash guest, and client VPN users can be updated)
    // PUT /networks/{networkId}/merakiAuthUsers/{merakiAuthUserId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-meraki-auth-user

    // Request body schema:
    //   name: String. Name of the user
    //   password: String. The password for this user account
    //   emailPasswordToUser: Boolean. Whether or not Meraki should email the password to user. Default is false.
    //   authorizations: Array. Authorization zones and expiration dates for the user.

    updateNetworkMerakiAuthUser (self, networkId, merakiAuthUserId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/merakiAuthUsers/" + merakiAuthUserId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkMqttBrokers: List the MQTT brokers for this network
    // GET /networks/{networkId}/mqttBrokers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-mqtt-brokers

    getNetworkMqttBrokers (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/mqttBrokers")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkMqttBroker: Add an MQTT broker
    // POST /networks/{networkId}/mqttBrokers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-mqtt-broker

    // Request body schema:
    //   name: String. Name of the MQTT broker
    //   host: String. Host name/IP address where MQTT broker runs
    //   port: Integer. Host port though which MQTT broker can be reached

    createNetworkMqttBroker (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/mqttBrokers", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkMqttBroker: Return an MQTT broker
    // GET /networks/{networkId}/mqttBrokers/{mqttBrokerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-mqtt-broker

    getNetworkMqttBroker (self, networkId, mqttBrokerId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/mqttBrokers/" + mqttBrokerId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkMqttBroker: Update an MQTT broker
    // PUT /networks/{networkId}/mqttBrokers/{mqttBrokerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-mqtt-broker

    // Request body schema:
    //   name: String. Name of the mqtt config
    //   host: String. Host name where mqtt broker runs
    //   port: Integer. Host port though which mqtt broker can be reached

    updateNetworkMqttBroker (self, networkId, mqttBrokerId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/mqttBrokers/" + mqttBrokerId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkMqttBroker: Delete an MQTT broker
    // DELETE /networks/{networkId}/mqttBrokers/{mqttBrokerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-mqtt-broker

    deleteNetworkMqttBroker (self, networkId, mqttBrokerId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/mqttBrokers/" + mqttBrokerId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkNetflow: Return the NetFlow traffic reporting settings for a network
    // GET /networks/{networkId}/netflow

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-netflow

    getNetworkNetflow (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/netflow")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkNetflow: Update the NetFlow traffic reporting settings for a network
    // PUT /networks/{networkId}/netflow

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-netflow

    // Request body schema:
    //   reportingEnabled: Boolean. Boolean indicating whether NetFlow traffic reporting is enabled (true) or disabled (false).
    //   collectorIp: String. The IPv4 address of the NetFlow collector.
    //   collectorPort: Integer. The port that the NetFlow collector will be listening on.
    //   etaEnabled: Boolean. Boolean indicating whether Encrypted Traffic Analysis is enabled (true) or disabled (false).
    //   etaDstPort: Integer. The port that the Encrypted Traffic Analysis collector will be listening on.

    updateNetworkNetflow (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/netflow", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkNetworkHealthChannelUtilization: Get the channel utilization over each radio for all APs in a network.
    // GET /networks/{networkId}/networkHealth/channelUtilization

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-network-health-channel-utilization

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 600. The default is 600.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 100. Default is 10.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkNetworkHealthChannelUtilization (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/networkHealth/channelUtilization", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkPiiPiiKeys: List the keys required to access Personally Identifiable Information (PII) for a given identifier. Exactly one identifier will be accepted. If the organization contains org-wide Systems Manager users matching the key provided then there will be an entry with the key "0" containing the applicable keys.  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/piiKeys ```
    // GET /networks/{networkId}/pii/piiKeys

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-pii-pii-keys

    // Query parameters:
    //   username: String. The username of a Systems Manager user
    //   email: String. The email of a network user account or a Systems Manager device
    //   mac: String. The MAC of a network client device or a Systems Manager device
    //   serial: String. The serial of a Systems Manager device
    //   imei: String. The IMEI of a Systems Manager device
    //   bluetoothMac: String. The MAC of a Bluetooth client

    getNetworkPiiPiiKeys (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/pii/piiKeys", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkPiiRequests: List the PII requests for this network or organization  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/requests ```
    // GET /networks/{networkId}/pii/requests

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-pii-requests

    getNetworkPiiRequests (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/pii/requests")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkPiiRequest: Submit a new delete or restrict processing PII request  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/requests ```
    // POST /networks/{networkId}/pii/requests

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-pii-request

    // Request body schema:
    //   type: String. One of "delete" or "restrict processing"
    //   datasets: Array. The datasets related to the provided key that should be deleted. Only applies to "delete" requests. The value "all" will be expanded to all datasets applicable to this type. The datasets by applicable to each type are: mac (usage, events, traffic), email (users, loginAttempts), username (users, loginAttempts), bluetoothMac (client, connectivity), smDeviceId (device), smUserId (user)
    //   username: String. The username of a network log in. Only applies to "delete" requests.
    //   email: String. The email of a network user account. Only applies to "delete" requests.
    //   mac: String. The MAC of a network client device. Applies to both "restrict processing" and "delete" requests.
    //   smDeviceId: String. The sm_device_id of a Systems Manager device. The only way to "restrict processing" or "delete" a Systems Manager device. Must include "device" in the dataset for a "delete" request to destroy the device.
    //   smUserId: String. The sm_user_id of a Systems Manager user. The only way to "restrict processing" or "delete" a Systems Manager user. Must include "user" in the dataset for a "delete" request to destroy the user.

    createNetworkPiiRequest (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/pii/requests", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkPiiRequest: Return a PII request  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/requests/{requestId} ```
    // GET /networks/{networkId}/pii/requests/{requestId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-pii-request

    getNetworkPiiRequest (self, networkId, requestId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/pii/requests/" + requestId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkPiiRequest: Delete a restrict processing PII request  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/requests/{requestId} ```
    // DELETE /networks/{networkId}/pii/requests/{requestId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-pii-request

    deleteNetworkPiiRequest (self, networkId, requestId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/pii/requests/" + requestId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkPiiSmDevicesForKey: Given a piece of Personally Identifiable Information (PII), return the Systems Manager device ID(s) associated with that identifier. These device IDs can be used with the Systems Manager API endpoints to retrieve device details. Exactly one identifier will be accepted.  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/smDevicesForKey ```
    // GET /networks/{networkId}/pii/smDevicesForKey

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-pii-sm-devices-for-key

    // Query parameters:
    //   username: String. The username of a Systems Manager user
    //   email: String. The email of a network user account or a Systems Manager device
    //   mac: String. The MAC of a network client device or a Systems Manager device
    //   serial: String. The serial of a Systems Manager device
    //   imei: String. The IMEI of a Systems Manager device
    //   bluetoothMac: String. The MAC of a Bluetooth client

    getNetworkPiiSmDevicesForKey (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/pii/smDevicesForKey", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkPiiSmOwnersForKey: Given a piece of Personally Identifiable Information (PII), return the Systems Manager owner ID(s) associated with that identifier. These owner IDs can be used with the Systems Manager API endpoints to retrieve owner details. Exactly one identifier will be accepted.  ## ALTERNATE PATH  ``` /organizations/{organizationId}/pii/smOwnersForKey ```
    // GET /networks/{networkId}/pii/smOwnersForKey

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-pii-sm-owners-for-key

    // Query parameters:
    //   username: String. The username of a Systems Manager user
    //   email: String. The email of a network user account or a Systems Manager device
    //   mac: String. The MAC of a network client device or a Systems Manager device
    //   serial: String. The serial of a Systems Manager device
    //   imei: String. The IMEI of a Systems Manager device
    //   bluetoothMac: String. The MAC of a Bluetooth client

    getNetworkPiiSmOwnersForKey (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/pii/smOwnersForKey", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSettings: Return the settings for a network
    // GET /networks/{networkId}/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-settings

    getNetworkSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSettings: Update the settings for a network
    // PUT /networks/{networkId}/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-settings

    // Request body schema:
    //   localStatusPageEnabled: Boolean. Enables / disables the local device status pages (<a target='_blank' href='http://my.meraki.com/'>my.meraki.com, </a><a target='_blank' href='http://ap.meraki.com/'>ap.meraki.com, </a><a target='_blank' href='http://switch.meraki.com/'>switch.meraki.com, </a><a target='_blank' href='http://wired.meraki.com/'>wired.meraki.com</a>). Optional (defaults to false)
    //   remoteStatusPageEnabled: Boolean. Enables / disables access to the device status page (<a target='_blank'>http://[device's LAN IP])</a>. Optional. Can only be set if localStatusPageEnabled is set to true
    //   secureConnect: Object. A hash of SecureConnect options applied to the Network.

    updateNetworkSettings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSmBypassActivationLockAttempt: Bypass activation lock attempt
    // POST /networks/{networkId}/sm/bypassActivationLockAttempts

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-sm-bypass-activation-lock-attempt

    // Request body schema:
    //   ids: Array. The ids of the devices to attempt activation lock bypass.

    createNetworkSmBypassActivationLockAttempt (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/bypassActivationLockAttempts", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmBypassActivationLockAttempt: Bypass activation lock attempt status
    // GET /networks/{networkId}/sm/bypassActivationLockAttempts/{attemptId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-bypass-activation-lock-attempt

    getNetworkSmBypassActivationLockAttempt (self, networkId, attemptId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/bypassActivationLockAttempts/" + attemptId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDevices: List the devices enrolled in an SM network with various specified fields and filters
    // GET /networks/{networkId}/sm/devices

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-devices

    // Query parameters:
    //   fields: Array. Additional fields that will be displayed for each device.     The default fields are: id, name, tags, ssid, wifiMac, osName, systemModel, uuid, and serialNumber. The additional fields are: ip,     systemType, availableDeviceCapacity, kioskAppName, biosVersion, lastConnected, missingAppsCount, userSuppliedAddress, location, lastUser,     ownerEmail, ownerUsername, osBuild, publicIp, phoneNumber, diskInfoJson, deviceCapacity, isManaged, hadMdm, isSupervised, meid, imei, iccid,     simCarrierNetwork, cellularDataUsed, isHotspotEnabled, createdAt, batteryEstCharge, quarantined, avName, avRunning, asName, fwName,     isRooted, loginRequired, screenLockEnabled, screenLockDelay, autoLoginDisabled, autoTags, hasMdm, hasDesktopAgent, diskEncryptionEnabled,     hardwareEncryptionCaps, passCodeLock, usesHardwareKeystore, and androidSecurityPatchVersion.
    //   wifiMacs: Array. Filter devices by wifi mac(s).
    //   serials: Array. Filter devices by serial(s).
    //   ids: Array. Filter devices by id(s).
    //   scope: Array. Specify a scope (one of all, none, withAny, withAll, withoutAny, or withoutAll) and a set of tags.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkSmDevices (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // checkinNetworkSmDevices: Force check-in a set of devices
    // POST /networks/{networkId}/sm/devices/checkin

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!checkin-network-sm-devices

    // Request body schema:
    //   wifiMacs: Array. The wifiMacs of the devices to be checked-in.
    //   ids: Array. The ids of the devices to be checked-in.
    //   serials: Array. The serials of the devices to be checked-in.
    //   scope: Array. The scope (one of all, none, withAny, withAll, withoutAny, or withoutAll) and a set of tags of the devices to be checked-in.

    checkinNetworkSmDevices (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/checkin", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSmDevicesFields: Modify the fields of a device
    // PUT /networks/{networkId}/sm/devices/fields

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-sm-devices-fields

    // Request body schema:
    //   wifiMac: String. The wifiMac of the device to be modified.
    //   id: String. The id of the device to be modified.
    //   serial: String. The serial of the device to be modified.
    //   deviceFields: Object. The new fields of the device. Each field of this object is optional.

    updateNetworkSmDevicesFields (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/sm/devices/fields", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // lockNetworkSmDevices: Lock a set of devices
    // POST /networks/{networkId}/sm/devices/lock

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!lock-network-sm-devices

    // Request body schema:
    //   wifiMacs: Array. The wifiMacs of the devices to be locked.
    //   ids: Array. The ids of the devices to be locked.
    //   serials: Array. The serials of the devices to be locked.
    //   scope: Array. The scope (one of all, none, withAny, withAll, withoutAny, or withoutAll) and a set of tags of the devices to be wiped.
    //   pin: Integer. The pin number for locking macOS devices (a six digit number). Required only for macOS devices.

    lockNetworkSmDevices (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/lock", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // modifyNetworkSmDevicesTags: Add, delete, or update the tags of a set of devices
    // POST /networks/{networkId}/sm/devices/modifyTags

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!modify-network-sm-devices-tags

    // Request body schema:
    //   wifiMacs: Array. The wifiMacs of the devices to be modified.
    //   ids: Array. The ids of the devices to be modified.
    //   serials: Array. The serials of the devices to be modified.
    //   scope: Array. The scope (one of all, none, withAny, withAll, withoutAny, or withoutAll) and a set of tags of the devices to be modified.
    //   tags: Array. The tags to be added, deleted, or updated.
    //   updateAction: String. One of add, delete, or update. Only devices that have been modified will be returned.

    modifyNetworkSmDevicesTags (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/modifyTags", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // moveNetworkSmDevices: Move a set of devices to a new network
    // POST /networks/{networkId}/sm/devices/move

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!move-network-sm-devices

    // Request body schema:
    //   wifiMacs: Array. The wifiMacs of the devices to be moved.
    //   ids: Array. The ids of the devices to be moved.
    //   serials: Array. The serials of the devices to be moved.
    //   scope: Array. The scope (one of all, none, withAny, withAll, withoutAny, or withoutAll) and a set of tags of the devices to be moved.
    //   newNetwork: String. The new network to which the devices will be moved.

    moveNetworkSmDevices (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/move", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // wipeNetworkSmDevices: Wipe a device
    // POST /networks/{networkId}/sm/devices/wipe

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!wipe-network-sm-devices

    // Request body schema:
    //   wifiMac: String. The wifiMac of the device to be wiped.
    //   id: String. The id of the device to be wiped.
    //   serial: String. The serial of the device to be wiped.
    //   pin: Integer. The pin number (a six digit value) for wiping a macOS device. Required only for macOS devices.

    wipeNetworkSmDevices (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/wipe", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceCellularUsageHistory: Return the client's daily cellular data usage history. Usage data is in kilobytes.
    // GET /networks/{networkId}/sm/devices/{deviceId}/cellularUsageHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-cellular-usage-history

    getNetworkSmDeviceCellularUsageHistory (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/cellularUsageHistory")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceCerts: List the certs on a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/certs

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-certs

    getNetworkSmDeviceCerts (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/certs")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceConnectivity: Returns historical connectivity data (whether a device is regularly checking in to Dashboard).
    // GET /networks/{networkId}/sm/devices/{deviceId}/connectivity

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-connectivity

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkSmDeviceConnectivity (self, networkId, deviceId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/connectivity", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceDesktopLogs: Return historical records of various Systems Manager network connection details for desktop devices.
    // GET /networks/{networkId}/sm/devices/{deviceId}/desktopLogs

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-desktop-logs

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkSmDeviceDesktopLogs (self, networkId, deviceId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/desktopLogs", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceDeviceCommandLogs: Return historical records of commands sent to Systems Manager devices. Note that this will include the name of the Dashboard user who initiated the command if it was generated by a Dashboard admin rather than the automatic behavior of the system; you may wish to filter this out of any reports.
    // GET /networks/{networkId}/sm/devices/{deviceId}/deviceCommandLogs

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-device-command-logs

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkSmDeviceDeviceCommandLogs (self, networkId, deviceId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/deviceCommandLogs", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceDeviceProfiles: Get the profiles associated with a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/deviceProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-device-profiles

    getNetworkSmDeviceDeviceProfiles (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/deviceProfiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceNetworkAdapters: List the network adapters of a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/networkAdapters

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-network-adapters

    getNetworkSmDeviceNetworkAdapters (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/networkAdapters")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDevicePerformanceHistory: Return historical records of various Systems Manager client metrics for desktop devices.
    // GET /networks/{networkId}/sm/devices/{deviceId}/performanceHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-performance-history

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkSmDevicePerformanceHistory (self, networkId, deviceId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/performanceHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // refreshNetworkSmDeviceDetails: Refresh the details of a device
    // POST /networks/{networkId}/sm/devices/{deviceId}/refreshDetails

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!refresh-network-sm-device-details

    refreshNetworkSmDeviceDetails (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/" + deviceId + "/refreshDetails")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceRestrictions: List the restrictions on a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/restrictions

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-restrictions

    getNetworkSmDeviceRestrictions (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/restrictions")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceSecurityCenters: List the security centers on a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/securityCenters

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-security-centers

    getNetworkSmDeviceSecurityCenters (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/securityCenters")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceSoftwares: Get a list of softwares associated with a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/softwares

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-softwares

    getNetworkSmDeviceSoftwares (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/softwares")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // unenrollNetworkSmDevice: Unenroll a device
    // POST /networks/{networkId}/sm/devices/{deviceId}/unenroll

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!unenroll-network-sm-device

    unenrollNetworkSmDevice (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/devices/" + deviceId + "/unenroll")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmDeviceWlanLists: List the saved SSID names on a device
    // GET /networks/{networkId}/sm/devices/{deviceId}/wlanLists

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-device-wlan-lists

    getNetworkSmDeviceWlanLists (self, networkId, deviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/devices/" + deviceId + "/wlanLists")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmProfiles: List all profiles in a network
    // GET /networks/{networkId}/sm/profiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-profiles

    getNetworkSmProfiles (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/profiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmTargetGroups: List the target groups in this network
    // GET /networks/{networkId}/sm/targetGroups

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-target-groups

    // Query parameters:
    //   withDetails: Boolean. Boolean indicating if the the ids of the devices or users scoped by the target group should be included in the response

    getNetworkSmTargetGroups (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/targetGroups", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSmTargetGroup: Add a target group
    // POST /networks/{networkId}/sm/targetGroups

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-sm-target-group

    // Request body schema:
    //   name: String. The name of this target group
    //   scope: String. The scope and tag options of the target group. Comma separated values beginning with one of withAny, withAll, withoutAny, withoutAll, all, none, followed by tags. Default to none if empty.

    createNetworkSmTargetGroup (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/sm/targetGroups", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmTargetGroup: Return a target group
    // GET /networks/{networkId}/sm/targetGroups/{targetGroupId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-target-group

    // Query parameters:
    //   withDetails: Boolean. Boolean indicating if the the ids of the devices or users scoped by the target group should be included in the response

    getNetworkSmTargetGroup (self, networkId, targetGroupId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/targetGroups/" + targetGroupId, { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSmTargetGroup: Update a target group
    // PUT /networks/{networkId}/sm/targetGroups/{targetGroupId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-sm-target-group

    // Request body schema:
    //   name: String. The name of this target group
    //   scope: String. The scope and tag options of the target group. Comma separated values beginning with one of withAny, withAll, withoutAny, withoutAll, all, none, followed by tags. Default to none if empty.

    updateNetworkSmTargetGroup (self, networkId, targetGroupId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/sm/targetGroups/" + targetGroupId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSmTargetGroup: Delete a target group from a network
    // DELETE /networks/{networkId}/sm/targetGroups/{targetGroupId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-sm-target-group

    deleteNetworkSmTargetGroup (self, networkId, targetGroupId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/sm/targetGroups/" + targetGroupId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmUserAccessDevices: List User Access Devices and its Trusted Access Connections
    // GET /networks/{networkId}/sm/userAccessDevices

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-user-access-devices

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 100.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkSmUserAccessDevices (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/userAccessDevices", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSmUserAccessDevice: Delete a User Access Device
    // DELETE /networks/{networkId}/sm/userAccessDevices/{userAccessDeviceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-sm-user-access-device

    deleteNetworkSmUserAccessDevice (self, networkId, userAccessDeviceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/sm/userAccessDevices/" + userAccessDeviceId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmUsers: List the owners in an SM network with various specified fields and filters
    // GET /networks/{networkId}/sm/users

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-users

    // Query parameters:
    //   ids: Array. Filter users by id(s).
    //   usernames: Array. Filter users by username(s).
    //   emails: Array. Filter users by email(s).
    //   scope: Array. Specifiy a scope (one of all, none, withAny, withAll, withoutAny, withoutAll) and a set of tags.

    getNetworkSmUsers (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/users", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmUserDeviceProfiles: Get the profiles associated with a user
    // GET /networks/{networkId}/sm/users/{userId}/deviceProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-user-device-profiles

    getNetworkSmUserDeviceProfiles (self, networkId, userId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/users/" + userId + "/deviceProfiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSmUserSoftwares: Get a list of softwares associated with a user
    // GET /networks/{networkId}/sm/users/{userId}/softwares

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-sm-user-softwares

    getNetworkSmUserSoftwares (self, networkId, userId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/sm/users/" + userId + "/softwares")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSnmp: Return the SNMP settings for a network
    // GET /networks/{networkId}/snmp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-snmp

    getNetworkSnmp (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/snmp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSnmp: Update the SNMP settings for a network
    // PUT /networks/{networkId}/snmp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-snmp

    // Request body schema:
    //   access: String. The type of SNMP access. Can be one of 'none' (disabled), 'community' (V1/V2c), or 'users' (V3).
    //   communityString: String. The SNMP community string. Only relevant if 'access' is set to 'community'.
    //   users: Array. The list of SNMP users. Only relevant if 'access' is set to 'users'.

    updateNetworkSnmp (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/snmp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSplashLoginAttempts: List the splash login attempts for a network
    // GET /networks/{networkId}/splashLoginAttempts

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-splash-login-attempts

    // Query parameters:
    //   ssidNumber: Integer. Only return the login attempts for the specified SSID
    //   loginIdentifier: String. The username, email, or phone number used during login
    //   timespan: Integer. The timespan, in seconds, for the login attempts. The period will be from [timespan] seconds ago until now. The maximum timespan is 3 months

    getNetworkSplashLoginAttempts (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/splashLoginAttempts", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // splitNetwork: Split a combined network into individual networks for each type of device
    // POST /networks/{networkId}/split

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!split-network

    splitNetwork (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/split")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchAccessControlLists: Return the access control lists for a MS network
    // GET /networks/{networkId}/switch/accessControlLists

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-access-control-lists

    getNetworkSwitchAccessControlLists (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/accessControlLists")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchAccessControlLists: Update the access control lists for a MS network
    // PUT /networks/{networkId}/switch/accessControlLists

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-access-control-lists

    // Request body schema:
    //   rules: Array. An ordered array of the access control list rules (not including the default rule). An empty array will clear the rules.

    updateNetworkSwitchAccessControlLists (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/accessControlLists", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchAccessPolicies: List the access policies for a switch network. Only returns access policies with 'my RADIUS server' as authentication method
    // GET /networks/{networkId}/switch/accessPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-access-policies

    getNetworkSwitchAccessPolicies (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/accessPolicies")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchAccessPolicy: Create an access policy for a switch network. This endpoint only supports access policies with 'My RADIUS server' as authentication method.
    // POST /networks/{networkId}/switch/accessPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-access-policy

    // Request body schema:
    //   name: String. Name of the access policy
    //   radiusServers: Array. List of RADIUS servers to require connecting devices to authenticate against before granting network access
    //   radius: Object. Object for RADIUS Settings
    //   radiusTestingEnabled: Boolean. If enabled, Meraki devices will periodically send access-request messages to these RADIUS servers
    //   radiusCoaSupportEnabled: Boolean. Change of authentication for RADIUS re-authentication and disconnection
    //   radiusAccountingEnabled: Boolean. Enable to send start, interim-update and stop messages to a configured RADIUS accounting server for tracking connected clients
    //   radiusAccountingServers: Array. List of RADIUS accounting servers to require connecting devices to authenticate against before granting network access
    //   radiusGroupAttribute: String. Acceptable values are `""` for None, or `"11"` for Group Policies ACL
    //   hostMode: String. Choose the Host Mode for the access policy.
    //   accessPolicyType: String. Access Type of the policy. Automatically 'Hybrid authentication' when hostMode is 'Multi-Domain'.
    //   increaseAccessSpeed: Boolean. Enabling this option will make switches execute 802.1X and MAC-bypass authentication simultaneously so that clients authenticate faster. Only required when accessPolicyType is 'Hybrid Authentication.
    //   guestVlanId: Integer. ID for the guest VLAN allow unauthorized devices access to limited network resources
    //   voiceVlanClients: Boolean. CDP/LLDP capable voice clients will be able to use this VLAN. Automatically true when hostMode is 'Multi-Domain'.
    //   urlRedirectWalledGardenEnabled: Boolean. Enable to restrict access for clients to a specific set of IP addresses or hostnames prior to authentication
    //   urlRedirectWalledGardenRanges: Array. IP address ranges, in CIDR notation, to restrict access for clients to a specific set of IP addresses or hostnames prior to authentication

    createNetworkSwitchAccessPolicy (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/accessPolicies", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchAccessPolicy: Return a specific access policy for a switch network
    // GET /networks/{networkId}/switch/accessPolicies/{accessPolicyNumber}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-access-policy

    getNetworkSwitchAccessPolicy (self, networkId, accessPolicyNumber) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/accessPolicies/" + accessPolicyNumber)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchAccessPolicy: Update an access policy for a switch network. This endpoint only supports access policies with 'My RADIUS server' as authentication method.
    // PUT /networks/{networkId}/switch/accessPolicies/{accessPolicyNumber}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-access-policy

    // Request body schema:
    //   name: String. Name of the access policy
    //   radiusServers: Array. List of RADIUS servers to require connecting devices to authenticate against before granting network access
    //   radius: Object. Object for RADIUS Settings
    //   radiusTestingEnabled: Boolean. If enabled, Meraki devices will periodically send access-request messages to these RADIUS servers
    //   radiusCoaSupportEnabled: Boolean. Change of authentication for RADIUS re-authentication and disconnection
    //   radiusAccountingEnabled: Boolean. Enable to send start, interim-update and stop messages to a configured RADIUS accounting server for tracking connected clients
    //   radiusAccountingServers: Array. List of RADIUS accounting servers to require connecting devices to authenticate against before granting network access
    //   radiusGroupAttribute: String. Can be either `""`, which means `None` on Dashboard, or `"11"`, which means `Filter-Id` on Dashboard and will use Group Policy ACLs when supported (firmware 14+)
    //   hostMode: String. Choose the Host Mode for the access policy.
    //   accessPolicyType: String. Access Type of the policy. Automatically 'Hybrid authentication' when hostMode is 'Multi-Domain'.
    //   increaseAccessSpeed: Boolean. Enabling this option will make switches execute 802.1X and MAC-bypass authentication simultaneously so that clients authenticate faster. Only required when accessPolicyType is 'Hybrid Authentication.
    //   guestVlanId: Integer. ID for the guest VLAN allow unauthorized devices access to limited network resources
    //   voiceVlanClients: Boolean. CDP/LLDP capable voice clients will be able to use this VLAN. Automatically true when hostMode is 'Multi-Domain'.
    //   urlRedirectWalledGardenEnabled: Boolean. Enable to restrict access for clients to a specific set of IP addresses or hostnames prior to authentication
    //   urlRedirectWalledGardenRanges: Array. IP address ranges, in CIDR notation, to restrict access for clients to a specific set of IP addresses or hostnames prior to authentication

    updateNetworkSwitchAccessPolicy (self, networkId, accessPolicyNumber, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/accessPolicies/" + accessPolicyNumber, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchAccessPolicy: Delete an access policy for a switch network
    // DELETE /networks/{networkId}/switch/accessPolicies/{accessPolicyNumber}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-access-policy

    deleteNetworkSwitchAccessPolicy (self, networkId, accessPolicyNumber) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/accessPolicies/" + accessPolicyNumber)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchAlternateManagementInterface: Return the switch alternate management interface for the network
    // GET /networks/{networkId}/switch/alternateManagementInterface

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-alternate-management-interface

    getNetworkSwitchAlternateManagementInterface (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/alternateManagementInterface")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchAlternateManagementInterface: Update the switch alternate management interface for the network
    // PUT /networks/{networkId}/switch/alternateManagementInterface

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-alternate-management-interface

    // Request body schema:
    //   enabled: Boolean. Boolean value to enable or disable AMI configuration. If enabled, VLAN and protocols must be set
    //   vlanId: Integer. Alternate management VLAN, must be between 1 and 4094
    //   protocols: Array. Can be one or more of the following values: 'radius', 'snmp' or 'syslog'
    //   switches: Array. Array of switch serial number and IP assignment. If parameter is present, it cannot have empty body. Note: switches parameter is not applicable for template networks, in other words, do not put 'switches' in the body when updating template networks. Also, an empty 'switches' array will remove all previous assignments

    updateNetworkSwitchAlternateManagementInterface (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/alternateManagementInterface", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchDhcpServerPolicy: Return the DHCP server policy
    // GET /networks/{networkId}/switch/dhcpServerPolicy

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-dhcp-server-policy

    getNetworkSwitchDhcpServerPolicy (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/dhcpServerPolicy")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchDhcpServerPolicy: Update the DHCP server policy
    // PUT /networks/{networkId}/switch/dhcpServerPolicy

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-dhcp-server-policy

    // Request body schema:
    //   defaultPolicy: String. 'allow' or 'block' new DHCP servers. Default value is 'allow'.
    //   allowedServers: Array. List the MAC addresses of DHCP servers to permit on the network. Applicable only if defaultPolicy is set to block. An empty array will clear the entries.
    //   blockedServers: Array. List the MAC addresses of DHCP servers to block on the network. Applicable only if defaultPolicy is set to allow. An empty array will clear the entries.

    updateNetworkSwitchDhcpServerPolicy (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/dhcpServerPolicy", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchDscpToCosMappings: Return the DSCP to CoS mappings
    // GET /networks/{networkId}/switch/dscpToCosMappings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-dscp-to-cos-mappings

    getNetworkSwitchDscpToCosMappings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/dscpToCosMappings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchDscpToCosMappings: Update the DSCP to CoS mappings
    // PUT /networks/{networkId}/switch/dscpToCosMappings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-dscp-to-cos-mappings

    // Request body schema:
    //   mappings: Array. An array of DSCP to CoS mappings. An empty array will reset the mappings to default.

    updateNetworkSwitchDscpToCosMappings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/dscpToCosMappings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchLinkAggregations: List link aggregation groups
    // GET /networks/{networkId}/switch/linkAggregations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-link-aggregations

    getNetworkSwitchLinkAggregations (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/linkAggregations")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchLinkAggregation: Create a link aggregation group
    // POST /networks/{networkId}/switch/linkAggregations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-link-aggregation

    // Request body schema:
    //   switchPorts: Array. Array of switch or stack ports for creating aggregation group. Minimum 2 and maximum 8 ports are supported.
    //   switchProfilePorts: Array. Array of switch profile ports for creating aggregation group. Minimum 2 and maximum 8 ports are supported.

    createNetworkSwitchLinkAggregation (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/linkAggregations", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchLinkAggregation: Update a link aggregation group
    // PUT /networks/{networkId}/switch/linkAggregations/{linkAggregationId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-link-aggregation

    // Request body schema:
    //   switchPorts: Array. Array of switch or stack ports for updating aggregation group. Minimum 2 and maximum 8 ports are supported.
    //   switchProfilePorts: Array. Array of switch profile ports for updating aggregation group. Minimum 2 and maximum 8 ports are supported.

    updateNetworkSwitchLinkAggregation (self, networkId, linkAggregationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/linkAggregations/" + linkAggregationId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchLinkAggregation: Split a link aggregation group into separate ports
    // DELETE /networks/{networkId}/switch/linkAggregations/{linkAggregationId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-link-aggregation

    deleteNetworkSwitchLinkAggregation (self, networkId, linkAggregationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/linkAggregations/" + linkAggregationId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchMtu: Return the MTU configuration
    // GET /networks/{networkId}/switch/mtu

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-mtu

    getNetworkSwitchMtu (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/mtu")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchMtu: Update the MTU configuration
    // PUT /networks/{networkId}/switch/mtu

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-mtu

    // Request body schema:
    //   defaultMtuSize: Integer. MTU size for the entire network. Default value is 9578.
    //   overrides: Array. Override MTU size for individual switches or switch profiles. An empty array will clear overrides.

    updateNetworkSwitchMtu (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/mtu", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchPortSchedules: List switch port schedules
    // GET /networks/{networkId}/switch/portSchedules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-port-schedules

    getNetworkSwitchPortSchedules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/portSchedules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchPortSchedule: Add a switch port schedule
    // POST /networks/{networkId}/switch/portSchedules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-port-schedule

    // Request body schema:
    //   name: String. The name for your port schedule. Required
    //   portSchedule: Object.     The schedule for switch port scheduling. Schedules are applied to days of the week.     When it's empty, default schedule with all days of a week are configured.     Any unspecified day in the schedule is added as a default schedule configuration of the day. 

    createNetworkSwitchPortSchedule (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/portSchedules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchPortSchedule: Delete a switch port schedule
    // DELETE /networks/{networkId}/switch/portSchedules/{portScheduleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-port-schedule

    deleteNetworkSwitchPortSchedule (self, networkId, portScheduleId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/portSchedules/" + portScheduleId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchPortSchedule: Update a switch port schedule
    // PUT /networks/{networkId}/switch/portSchedules/{portScheduleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-port-schedule

    // Request body schema:
    //   name: String. The name for your port schedule.
    //   portSchedule: Object.     The schedule for switch port scheduling. Schedules are applied to days of the week.     When it's empty, default schedule with all days of a week are configured.     Any unspecified day in the schedule is added as a default schedule configuration of the day. 

    updateNetworkSwitchPortSchedule (self, networkId, portScheduleId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/portSchedules/" + portScheduleId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchQosRules: List quality of service rules
    // GET /networks/{networkId}/switch/qosRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-qos-rules

    getNetworkSwitchQosRules (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/qosRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchQosRule: Add a quality of service rule
    // POST /networks/{networkId}/switch/qosRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-qos-rule

    // Request body schema:
    //   vlan: Integer. The VLAN of the incoming packet. A null value will match any VLAN.
    //   protocol: String. The protocol of the incoming packet. Can be one of "ANY", "TCP" or "UDP". Default value is "ANY"
    //   srcPort: Integer. The source port of the incoming packet. Applicable only if protocol is TCP or UDP.
    //   srcPortRange: String. The source port range of the incoming packet. Applicable only if protocol is set to TCP or UDP. Example: 70-80
    //   dstPort: Integer. The destination port of the incoming packet. Applicable only if protocol is TCP or UDP.
    //   dstPortRange: String. The destination port range of the incoming packet. Applicable only if protocol is set to TCP or UDP. Example: 70-80
    //   dscp: Integer. DSCP tag. Set this to -1 to trust incoming DSCP. Default value is 0

    createNetworkSwitchQosRule (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/qosRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchQosRulesOrder: Return the quality of service rule IDs by order in which they will be processed by the switch
    // GET /networks/{networkId}/switch/qosRules/order

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-qos-rules-order

    getNetworkSwitchQosRulesOrder (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/qosRules/order")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchQosRulesOrder: Update the order in which the rules should be processed by the switch
    // PUT /networks/{networkId}/switch/qosRules/order

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-qos-rules-order

    // Request body schema:
    //   ruleIds: Array. A list of quality of service rule IDs arranged in order in which they should be processed by the switch.

    updateNetworkSwitchQosRulesOrder (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/qosRules/order", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchQosRule: Return a quality of service rule
    // GET /networks/{networkId}/switch/qosRules/{qosRuleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-qos-rule

    getNetworkSwitchQosRule (self, networkId, qosRuleId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/qosRules/" + qosRuleId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchQosRule: Delete a quality of service rule
    // DELETE /networks/{networkId}/switch/qosRules/{qosRuleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-qos-rule

    deleteNetworkSwitchQosRule (self, networkId, qosRuleId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/qosRules/" + qosRuleId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchQosRule: Update a quality of service rule
    // PUT /networks/{networkId}/switch/qosRules/{qosRuleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-qos-rule

    // Request body schema:
    //   vlan: Integer. The VLAN of the incoming packet. A null value will match any VLAN.
    //   protocol: String. The protocol of the incoming packet. Can be one of "ANY", "TCP" or "UDP". Default value is "ANY".
    //   srcPort: Integer. The source port of the incoming packet. Applicable only if protocol is TCP or UDP.
    //   srcPortRange: String. The source port range of the incoming packet. Applicable only if protocol is set to TCP or UDP. Example: 70-80
    //   dstPort: Integer. The destination port of the incoming packet. Applicable only if protocol is TCP or UDP.
    //   dstPortRange: String. The destination port range of the incoming packet. Applicable only if protocol is set to TCP or UDP. Example: 70-80
    //   dscp: Integer. DSCP tag that should be assigned to incoming packet. Set this to -1 to trust incoming DSCP. Default value is 0.

    updateNetworkSwitchQosRule (self, networkId, qosRuleId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/qosRules/" + qosRuleId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchRoutingMulticast: Return multicast settings for a network
    // GET /networks/{networkId}/switch/routing/multicast

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-routing-multicast

    getNetworkSwitchRoutingMulticast (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/routing/multicast")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchRoutingMulticast: Update multicast settings for a network
    // PUT /networks/{networkId}/switch/routing/multicast

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-routing-multicast

    // Request body schema:
    //   defaultSettings: Object. Default multicast setting for entire network. IGMP snooping and Flood unknown multicast traffic settings are enabled by default.
    //   overrides: Array. Array of paired switches/stacks/profiles and corresponding multicast settings. An empty array will clear the multicast settings.

    updateNetworkSwitchRoutingMulticast (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/routing/multicast", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchRoutingMulticastRendezvousPoints: List multicast rendezvous points
    // GET /networks/{networkId}/switch/routing/multicast/rendezvousPoints

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-routing-multicast-rendezvous-points

    getNetworkSwitchRoutingMulticastRendezvousPoints (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/routing/multicast/rendezvousPoints")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchRoutingMulticastRendezvousPoint: Create a multicast rendezvous point
    // POST /networks/{networkId}/switch/routing/multicast/rendezvousPoints

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-routing-multicast-rendezvous-point

    // Request body schema:
    //   interfaceIp: String. The IP address of the interface where the RP needs to be created.
    //   multicastGroup: String. 'Any', or the IP address of a multicast group

    createNetworkSwitchRoutingMulticastRendezvousPoint (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/routing/multicast/rendezvousPoints", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchRoutingMulticastRendezvousPoint: Return a multicast rendezvous point
    // GET /networks/{networkId}/switch/routing/multicast/rendezvousPoints/{rendezvousPointId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-routing-multicast-rendezvous-point

    getNetworkSwitchRoutingMulticastRendezvousPoint (self, networkId, rendezvousPointId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/routing/multicast/rendezvousPoints/" + rendezvousPointId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchRoutingMulticastRendezvousPoint: Delete a multicast rendezvous point
    // DELETE /networks/{networkId}/switch/routing/multicast/rendezvousPoints/{rendezvousPointId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-routing-multicast-rendezvous-point

    deleteNetworkSwitchRoutingMulticastRendezvousPoint (self, networkId, rendezvousPointId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/routing/multicast/rendezvousPoints/" + rendezvousPointId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchRoutingMulticastRendezvousPoint: Update a multicast rendezvous point
    // PUT /networks/{networkId}/switch/routing/multicast/rendezvousPoints/{rendezvousPointId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-routing-multicast-rendezvous-point

    // Request body schema:
    //   interfaceIp: String. The IP address of the interface to use
    //   multicastGroup: String. 'Any', or the IP address of a multicast group

    updateNetworkSwitchRoutingMulticastRendezvousPoint (self, networkId, rendezvousPointId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/routing/multicast/rendezvousPoints/" + rendezvousPointId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchRoutingOspf: Return layer 3 OSPF routing configuration
    // GET /networks/{networkId}/switch/routing/ospf

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-routing-ospf

    getNetworkSwitchRoutingOspf (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/routing/ospf")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchRoutingOspf: Update layer 3 OSPF routing configuration
    // PUT /networks/{networkId}/switch/routing/ospf

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-routing-ospf

    // Request body schema:
    //   enabled: Boolean. Boolean value to enable or disable OSPF routing. OSPF routing is disabled by default.
    //   helloTimerInSeconds: Integer. Time interval in seconds at which hello packet will be sent to OSPF neighbors to maintain connectivity. Value must be between 1 and 255. Default is 10 seconds
    //   deadTimerInSeconds: Integer. Time interval to determine when the peer will be declare inactive/dead. Value must be between 1 and 65535
    //   areas: Array. OSPF areas
    //   md5AuthenticationEnabled: Boolean. Boolean value to enable or disable MD5 authentication. MD5 authentication is disabled by default.
    //   md5AuthenticationKey: Object. MD5 authentication credentials. This param is only relevant if md5AuthenticationEnabled is true

    updateNetworkSwitchRoutingOspf (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/routing/ospf", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchSettings: Returns the switch network settings
    // GET /networks/{networkId}/switch/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-settings

    getNetworkSwitchSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchSettings: Update switch network settings
    // PUT /networks/{networkId}/switch/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-settings

    // Request body schema:
    //   vlan: Integer. Management VLAN
    //   useCombinedPower: Boolean. The use Combined Power as the default behavior of secondary power supplies on supported devices.
    //   powerExceptions: Array. Exceptions on a per switch basis to "useCombinedPower"

    updateNetworkSwitchSettings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStacks: List the switch stacks in a network
    // GET /networks/{networkId}/switch/stacks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stacks

    getNetworkSwitchStacks (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchStack: Create a stack
    // POST /networks/{networkId}/switch/stacks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-stack

    // Request body schema:
    //   name: String. The name of the new stack
    //   serials: Array. An array of switch serials to be added into the new stack

    createNetworkSwitchStack (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/stacks", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStack: Show a switch stack
    // GET /networks/{networkId}/switch/stacks/{switchStackId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stack

    getNetworkSwitchStack (self, networkId, switchStackId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks/" + switchStackId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchStack: Delete a stack
    // DELETE /networks/{networkId}/switch/stacks/{switchStackId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-stack

    deleteNetworkSwitchStack (self, networkId, switchStackId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/stacks/" + switchStackId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // addNetworkSwitchStack: Add a switch to a stack
    // POST /networks/{networkId}/switch/stacks/{switchStackId}/add

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!add-network-switch-stack

    // Request body schema:
    //   serial: String. The serial of the switch to be added

    addNetworkSwitchStack (self, networkId, switchStackId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/add", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // removeNetworkSwitchStack: Remove a switch from a stack
    // POST /networks/{networkId}/switch/stacks/{switchStackId}/remove

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!remove-network-switch-stack

    // Request body schema:
    //   serial: String. The serial of the switch to be removed

    removeNetworkSwitchStack (self, networkId, switchStackId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/remove", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStackRoutingInterfaces: List layer 3 interfaces for a switch stack
    // GET /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stack-routing-interfaces

    getNetworkSwitchStackRoutingInterfaces (self, networkId, switchStackId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchStackRoutingInterface: Create a layer 3 interface for a switch stack
    // POST /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-stack-routing-interface

    // Request body schema:
    //   name: String. A friendly name or description for the interface or VLAN.
    //   subnet: String. The network that this routed interface is on, in CIDR notation (ex. 10.1.1.0/24).
    //   interfaceIp: String. The IP address this switch stack will use for layer 3 routing on this VLAN or subnet. This cannot be the same as the switch's management IP.
    //   multicastRouting: String. Enable multicast support if, multicast routing between VLANs is required. Options are, 'disabled', 'enabled' or 'IGMP snooping querier'. Default is 'disabled'.
    //   vlanId: Integer. The VLAN this routed interface is on. VLAN must be between 1 and 4094.
    //   defaultGateway: String. The next hop for any traffic that isn't going to a directly connected subnet or over a static route. This IP address must exist in a subnet with a routed interface.
    //   ospfSettings: Object. The OSPF routing settings of the interface.

    createNetworkSwitchStackRoutingInterface (self, networkId, switchStackId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStackRoutingInterface: Return a layer 3 interface from a switch stack
    // GET /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces/{interfaceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stack-routing-interface

    getNetworkSwitchStackRoutingInterface (self, networkId, switchStackId, interfaceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces/" + interfaceId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchStackRoutingInterface: Update a layer 3 interface for a switch stack
    // PUT /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces/{interfaceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-stack-routing-interface

    // Request body schema:
    //   name: String. A friendly name or description for the interface or VLAN.
    //   subnet: String. The network that this routed interface is on, in CIDR notation (ex. 10.1.1.0/24).
    //   interfaceIp: String. The IP address this switch stack will use for layer 3 routing on this VLAN or subnet. This cannot be the same as the switch's management IP.
    //   multicastRouting: String. Enable multicast support if, multicast routing between VLANs is required. Options are, 'disabled', 'enabled' or 'IGMP snooping querier'.
    //   vlanId: Integer. The VLAN this routed interface is on. VLAN must be between 1 and 4094.
    //   ospfSettings: Object. The OSPF routing settings of the interface.

    updateNetworkSwitchStackRoutingInterface (self, networkId, switchStackId, interfaceId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces/" + interfaceId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchStackRoutingInterface: Delete a layer 3 interface from a switch stack
    // DELETE /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces/{interfaceId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-stack-routing-interface

    deleteNetworkSwitchStackRoutingInterface (self, networkId, switchStackId, interfaceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces/" + interfaceId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStackRoutingInterfaceDhcp: Return a layer 3 interface DHCP configuration for a switch stack
    // GET /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces/{interfaceId}/dhcp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stack-routing-interface-dhcp

    getNetworkSwitchStackRoutingInterfaceDhcp (self, networkId, switchStackId, interfaceId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces/" + interfaceId + "/dhcp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchStackRoutingInterfaceDhcp: Update a layer 3 interface DHCP configuration for a switch stack
    // PUT /networks/{networkId}/switch/stacks/{switchStackId}/routing/interfaces/{interfaceId}/dhcp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-stack-routing-interface-dhcp

    // Request body schema:
    //   dhcpMode: String. The DHCP mode options for the switch stack interface ('dhcpDisabled', 'dhcpRelay' or 'dhcpServer')
    //   dhcpRelayServerIps: Array. The DHCP relay server IPs to which DHCP packets would get relayed for the switch stack interface
    //   dhcpLeaseTime: String. The DHCP lease time config for the dhcp server running on switch stack interface ('30 minutes', '1 hour', '4 hours', '12 hours', '1 day' or '1 week')
    //   dnsNameserversOption: String. The DHCP name server option for the dhcp server running on the switch stack interface ('googlePublicDns', 'openDns' or 'custom')
    //   dnsCustomNameservers: Array. The DHCP name server IPs when DHCP name server option is 'custom'
    //   bootOptionsEnabled: Boolean. Enable DHCP boot options to provide PXE boot options configs for the dhcp server running on the switch stack interface
    //   bootNextServer: String. The PXE boot server IP for the DHCP server running on the switch stack interface
    //   bootFileName: String. The PXE boot server file name for the DHCP server running on the switch stack interface
    //   dhcpOptions: Array. Array of DHCP options consisting of code, type and value for the DHCP server running on the switch stack interface
    //   reservedIpRanges: Array. Array of DHCP reserved IP assignments for the DHCP server running on the switch stack interface
    //   fixedIpAssignments: Array. Array of DHCP fixed IP assignments for the DHCP server running on the switch stack interface

    updateNetworkSwitchStackRoutingInterfaceDhcp (self, networkId, switchStackId, interfaceId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/interfaces/" + interfaceId + "/dhcp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStackRoutingStaticRoutes: List layer 3 static routes for a switch stack
    // GET /networks/{networkId}/switch/stacks/{switchStackId}/routing/staticRoutes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stack-routing-static-routes

    getNetworkSwitchStackRoutingStaticRoutes (self, networkId, switchStackId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/staticRoutes")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkSwitchStackRoutingStaticRoute: Create a layer 3 static route for a switch stack
    // POST /networks/{networkId}/switch/stacks/{switchStackId}/routing/staticRoutes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-switch-stack-routing-static-route

    // Request body schema:
    //   name: String. Name or description for layer 3 static route
    //   subnet: String. The subnet which is routed via this static route and should be specified in CIDR notation (ex. 1.2.3.0/24)
    //   nextHopIp: String. IP address of the next hop device to which the device sends its traffic for the subnet
    //   advertiseViaOspfEnabled: Boolean. Option to advertise static route via OSPF
    //   preferOverOspfRoutesEnabled: Boolean. Option to prefer static route over OSPF routes

    createNetworkSwitchStackRoutingStaticRoute (self, networkId, switchStackId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/staticRoutes", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStackRoutingStaticRoute: Return a layer 3 static route for a switch stack
    // GET /networks/{networkId}/switch/stacks/{switchStackId}/routing/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stack-routing-static-route

    getNetworkSwitchStackRoutingStaticRoute (self, networkId, switchStackId, staticRouteId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/staticRoutes/" + staticRouteId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchStackRoutingStaticRoute: Update a layer 3 static route for a switch stack
    // PUT /networks/{networkId}/switch/stacks/{switchStackId}/routing/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-stack-routing-static-route

    // Request body schema:
    //   name: String. Name or description for layer 3 static route
    //   subnet: String. The subnet which is routed via this static route and should be specified in CIDR notation (ex. 1.2.3.0/24)
    //   nextHopIp: String. IP address of the next hop device to which the device sends its traffic for the subnet
    //   advertiseViaOspfEnabled: Boolean. Option to advertise static route via OSPF
    //   preferOverOspfRoutesEnabled: Boolean. Option to prefer static route over OSPF routes

    updateNetworkSwitchStackRoutingStaticRoute (self, networkId, switchStackId, staticRouteId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/staticRoutes/" + staticRouteId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkSwitchStackRoutingStaticRoute: Delete a layer 3 static route for a switch stack
    // DELETE /networks/{networkId}/switch/stacks/{switchStackId}/routing/staticRoutes/{staticRouteId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-switch-stack-routing-static-route

    deleteNetworkSwitchStackRoutingStaticRoute (self, networkId, switchStackId, staticRouteId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/switch/stacks/" + switchStackId + "/routing/staticRoutes/" + staticRouteId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStormControl: Return the storm control configuration for a switch network
    // GET /networks/{networkId}/switch/stormControl

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-storm-control

    getNetworkSwitchStormControl (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stormControl")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchStormControl: Update the storm control configuration for a switch network
    // PUT /networks/{networkId}/switch/stormControl

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-storm-control

    // Request body schema:
    //   broadcastThreshold: Integer. Percentage (1 to 99) of total available port bandwidth for broadcast traffic type. Default value 100 percent rate is to clear the configuration.
    //   multicastThreshold: Integer. Percentage (1 to 99) of total available port bandwidth for multicast traffic type. Default value 100 percent rate is to clear the configuration.
    //   unknownUnicastThreshold: Integer. Percentage (1 to 99) of total available port bandwidth for unknown unicast (dlf-destination lookup failure) traffic type. Default value 100 percent rate is to clear the configuration.

    updateNetworkSwitchStormControl (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/stormControl", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSwitchStp: Returns STP settings
    // GET /networks/{networkId}/switch/stp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-switch-stp

    getNetworkSwitchStp (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/switch/stp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSwitchStp: Updates STP settings
    // PUT /networks/{networkId}/switch/stp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-switch-stp

    // Request body schema:
    //   rstpEnabled: Boolean. The spanning tree protocol status in network
    //   stpBridgePriority: Array. STP bridge priority for switches/stacks or switch profiles. An empty array will clear the STP bridge priority settings.

    updateNetworkSwitchStp (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/switch/stp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkSyslogServers: List the syslog servers for a network
    // GET /networks/{networkId}/syslogServers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-syslog-servers

    getNetworkSyslogServers (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/syslogServers")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkSyslogServers: Update the syslog servers for a network
    // PUT /networks/{networkId}/syslogServers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-syslog-servers

    // Request body schema:
    //   servers: Array. A list of the syslog servers for this network

    updateNetworkSyslogServers (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/syslogServers", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkTraffic: Return the traffic analysis data for this network. Traffic analysis with hostname visibility must be enabled on the network.
    // GET /networks/{networkId}/traffic

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-traffic

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 30 days from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 30 days.
    //   deviceType: String. Filter the data by device type: 'combined', 'wireless', 'switch' or 'appliance'. Defaults to 'combined'. When using 'combined', for each rule the data will come from the device type with the most usage.

    getNetworkTraffic (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/traffic", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkTrafficAnalysis: Return the traffic analysis settings for a network
    // GET /networks/{networkId}/trafficAnalysis

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-traffic-analysis

    getNetworkTrafficAnalysis (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/trafficAnalysis")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkTrafficAnalysis: Update the traffic analysis settings for a network
    // PUT /networks/{networkId}/trafficAnalysis

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-traffic-analysis

    // Request body schema:
    //   mode: String.     The traffic analysis mode for the network. Can be one of 'disabled' (do not collect traffic types),     'basic' (collect generic traffic categories), or 'detailed' (collect destination hostnames). 
    //   customPieChartItems: Array. The list of items that make up the custom pie chart for traffic reporting.

    updateNetworkTrafficAnalysis (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/trafficAnalysis", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkTrafficShapingApplicationCategories: Returns the application categories for traffic shaping rules.
    // GET /networks/{networkId}/trafficShaping/applicationCategories

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-traffic-shaping-application-categories

    getNetworkTrafficShapingApplicationCategories (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/trafficShaping/applicationCategories")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkTrafficShapingDscpTaggingOptions: Returns the available DSCP tagging options for your traffic shaping rules.
    // GET /networks/{networkId}/trafficShaping/dscpTaggingOptions

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-traffic-shaping-dscp-tagging-options

    getNetworkTrafficShapingDscpTaggingOptions (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/trafficShaping/dscpTaggingOptions")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // unbindNetwork: Unbind a network from a template.
    // POST /networks/{networkId}/unbind

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!unbind-network

    unbindNetwork (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/unbind")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWebhooksHttpServers: List the HTTP servers for a network
    // GET /networks/{networkId}/webhooks/httpServers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-webhooks-http-servers

    getNetworkWebhooksHttpServers (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/webhooks/httpServers")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkWebhooksHttpServer: Add an HTTP server to a network
    // POST /networks/{networkId}/webhooks/httpServers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-webhooks-http-server

    // Request body schema:
    //   name: String. A name for easy reference to the HTTP server
    //   url: String. The URL of the HTTP server
    //   sharedSecret: String. A shared secret that will be included in POSTs sent to the HTTP server. This secret can be used to verify that the request was sent by Meraki.

    createNetworkWebhooksHttpServer (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/webhooks/httpServers", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWebhooksHttpServer: Return an HTTP server for a network
    // GET /networks/{networkId}/webhooks/httpServers/{httpServerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-webhooks-http-server

    getNetworkWebhooksHttpServer (self, networkId, httpServerId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/webhooks/httpServers/" + httpServerId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWebhooksHttpServer: Update an HTTP server
    // PUT /networks/{networkId}/webhooks/httpServers/{httpServerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-webhooks-http-server

    // Request body schema:
    //   name: String. A name for easy reference to the HTTP server
    //   url: String. The URL of the HTTP server
    //   sharedSecret: String. A shared secret that will be included in POSTs sent to the HTTP server. This secret can be used to verify that the request was sent by Meraki.

    updateNetworkWebhooksHttpServer (self, networkId, httpServerId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/webhooks/httpServers/" + httpServerId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkWebhooksHttpServer: Delete an HTTP server from a network
    // DELETE /networks/{networkId}/webhooks/httpServers/{httpServerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-webhooks-http-server

    deleteNetworkWebhooksHttpServer (self, networkId, httpServerId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/webhooks/httpServers/" + httpServerId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkWebhooksWebhookTest: Send a test webhook for a network
    // POST /networks/{networkId}/webhooks/webhookTests

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-webhooks-webhook-test

    // Request body schema:
    //   url: String. The URL where the test webhook will be sent
    //   sharedSecret: String. The shared secret the test webhook will send. Optional. Defaults to an empty string.

    createNetworkWebhooksWebhookTest (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/webhooks/webhookTests", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWebhooksWebhookTest: Return the status of a webhook test for a network
    // GET /networks/{networkId}/webhooks/webhookTests/{webhookTestId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-webhooks-webhook-test

    getNetworkWebhooksWebhookTest (self, networkId, webhookTestId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/webhooks/webhookTests/" + webhookTestId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessAirMarshal: List Air Marshal scan results from a network
    // GET /networks/{networkId}/wireless/airMarshal

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-air-marshal

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameter t0. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.

    getNetworkWirelessAirMarshal (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/airMarshal", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessAlternateManagementInterface: Return alternate management interface and devices with IP assigned
    // GET /networks/{networkId}/wireless/alternateManagementInterface

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-alternate-management-interface

    getNetworkWirelessAlternateManagementInterface (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/alternateManagementInterface")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessAlternateManagementInterface: Update alternate management interface and device static IP
    // PUT /networks/{networkId}/wireless/alternateManagementInterface

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-alternate-management-interface

    // Request body schema:
    //   enabled: Boolean. Boolean value to enable or disable alternate management interface
    //   vlanId: Integer. Alternate management interface VLAN, must be between 1 and 4094
    //   protocols: Array. Can be one or more of the following values: 'radius', 'snmp', 'syslog' or 'ldap'
    //   accessPoints: Array. Array of access point serial number and IP assignment. Note: accessPoints IP assignment is not applicable for template networks, in other words, do not put 'accessPoints' in the body when updating template networks. Also, an empty 'accessPoints' array will remove all previous static IP assignments

    updateNetworkWirelessAlternateManagementInterface (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/alternateManagementInterface", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessBilling: Return the billing settings of this network
    // GET /networks/{networkId}/wireless/billing

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-billing

    getNetworkWirelessBilling (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/billing")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessBilling: Update the billing settings
    // PUT /networks/{networkId}/wireless/billing

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-billing

    // Request body schema:
    //   currency: String. The currency code of this node group's billing plans
    //   plans: Array. Array of billing plans in the node group. (Can configure a maximum of 5)

    updateNetworkWirelessBilling (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/billing", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessBluetoothSettings: Return the Bluetooth settings for a network. <a href="https://documentation.meraki.com/MR/Bluetooth/Bluetooth_Low_Energy_(BLE)">Bluetooth settings</a> must be enabled on the network.
    // GET /networks/{networkId}/wireless/bluetooth/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-bluetooth-settings

    getNetworkWirelessBluetoothSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/bluetooth/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessBluetoothSettings: Update the Bluetooth settings for a network. See the docs page for <a href="https://documentation.meraki.com/MR/Bluetooth/Bluetooth_Low_Energy_(BLE)">Bluetooth settings</a>.
    // PUT /networks/{networkId}/wireless/bluetooth/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-bluetooth-settings

    // Request body schema:
    //   scanningEnabled: Boolean. Whether APs will scan for Bluetooth enabled clients. (true, false)
    //   advertisingEnabled: Boolean. Whether APs will advertise beacons. (true, false)
    //   uuid: String. The UUID to be used in the beacon identifier.
    //   majorMinorAssignmentMode: String. The way major and minor number should be assigned to nodes in the network. ('Unique', 'Non-unique')
    //   major: Integer. The major number to be used in the beacon identifier. Only valid in 'Non-unique' mode.
    //   minor: Integer. The minor number to be used in the beacon identifier. Only valid in 'Non-unique' mode.

    updateNetworkWirelessBluetoothSettings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/bluetooth/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessChannelUtilizationHistory: Return AP channel utilization over time for a device or network client
    // GET /networks/{networkId}/wireless/channelUtilizationHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-channel-utilization-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 600, 1200, 3600, 14400, 86400. The default is 86400.
    //   autoResolution: Boolean. Automatically select a data resolution based on the given timespan; this overrides the value specified by the 'resolution' parameter. The default setting is false.
    //   clientId: String. Filter results by network client to return per-device, per-band AP channel utilization metrics inner joined by the queried client's connection history.
    //   deviceSerial: String. Filter results by device to return AP channel utilization metrics for the queried device; either :band or :clientId must be jointly specified.
    //   apTag: String. Filter results by AP tag to return AP channel utilization metrics for devices labeled with the given tag; either :clientId or :deviceSerial must be jointly specified.
    //   band: String. Filter results by band (either '2.4' or '5').

    getNetworkWirelessChannelUtilizationHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/channelUtilizationHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientCountHistory: Return wireless client counts over time for a network, device, or network client
    // GET /networks/{networkId}/wireless/clientCountHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-client-count-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 300, 600, 1200, 3600, 14400, 86400. The default is 86400.
    //   autoResolution: Boolean. Automatically select a data resolution based on the given timespan; this overrides the value specified by the 'resolution' parameter. The default setting is false.
    //   clientId: String. Filter results by network client to return per-device client counts over time inner joined by the queried client's connection history.
    //   deviceSerial: String. Filter results by device.
    //   apTag: String. Filter results by AP tag.
    //   band: String. Filter results by band (either '2.4' or '5').
    //   ssid: Integer. Filter results by SSID number.

    getNetworkWirelessClientCountHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clientCountHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientsConnectionStats: Aggregated connectivity info for this network, grouped by clients
    // GET /networks/{networkId}/wireless/clients/connectionStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-clients-connection-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag

    getNetworkWirelessClientsConnectionStats (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clients/connectionStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientsLatencyStats: Aggregated latency info for this network, grouped by clients
    // GET /networks/{networkId}/wireless/clients/latencyStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-clients-latency-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag
    //   fields: String. Partial selection: If present, this call will return only the selected fields of ["rawDistribution", "avg"]. All fields will be returned by default. Selected fields must be entered as a comma separated string.

    getNetworkWirelessClientsLatencyStats (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clients/latencyStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientConnectionStats: Aggregated connectivity info for a given client on this network. Clients are identified by their MAC.
    // GET /networks/{networkId}/wireless/clients/{clientId}/connectionStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-client-connection-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag

    getNetworkWirelessClientConnectionStats (self, networkId, clientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clients/" + clientId + "/connectionStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientConnectivityEvents: List the wireless connectivity events for a client within a network in the timespan.
    // GET /networks/{networkId}/wireless/clients/{clientId}/connectivityEvents

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-client-connectivity-events

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.
    //   types: Array. A list of event types to include. If not specified, events of all types will be returned. Valid types are 'assoc', 'disassoc', 'auth', 'deauth', 'dns', 'dhcp', 'roam', 'connection' and/or 'sticky'.
    //   includedSeverities: Array. A list of severities to include. If not specified, events of all severities will be returned. Valid severities are 'good', 'info', 'warn' and/or 'bad'.
    //   band: String. Filter results by band (either '2.4' or '5').
    //   ssidNumber: Integer. An SSID number to include. If not specified, events for all SSIDs will be returned.
    //   deviceSerial: String. Filter results by an AP's serial number.

    getNetworkWirelessClientConnectivityEvents (self, networkId, clientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clients/" + clientId + "/connectivityEvents", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientLatencyHistory: Return the latency history for a client. Clients can be identified by a client key or either the MAC or IP depending on whether the network uses Track-by-IP. The latency data is from a sample of 2% of packets and is grouped into 4 traffic categories: background, best effort, video, voice. Within these categories the sampled packet counters are bucketed by latency in milliseconds.
    // GET /networks/{networkId}/wireless/clients/{clientId}/latencyHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-client-latency-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 791 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 791 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 791 days. The default is 1 day.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 86400. The default is 86400.

    getNetworkWirelessClientLatencyHistory (self, networkId, clientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clients/" + clientId + "/latencyHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessClientLatencyStats: Aggregated latency info for a given client on this network. Clients are identified by their MAC.
    // GET /networks/{networkId}/wireless/clients/{clientId}/latencyStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-client-latency-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag
    //   fields: String. Partial selection: If present, this call will return only the selected fields of ["rawDistribution", "avg"]. All fields will be returned by default. Selected fields must be entered as a comma separated string.

    getNetworkWirelessClientLatencyStats (self, networkId, clientId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/clients/" + clientId + "/latencyStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessConnectionStats: Aggregated connectivity info for this network
    // GET /networks/{networkId}/wireless/connectionStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-connection-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag

    getNetworkWirelessConnectionStats (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/connectionStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessDataRateHistory: Return PHY data rates over time for a network, device, or network client
    // GET /networks/{networkId}/wireless/dataRateHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-data-rate-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 300, 600, 1200, 3600, 14400, 86400. The default is 86400.
    //   autoResolution: Boolean. Automatically select a data resolution based on the given timespan; this overrides the value specified by the 'resolution' parameter. The default setting is false.
    //   clientId: String. Filter results by network client.
    //   deviceSerial: String. Filter results by device.
    //   apTag: String. Filter results by AP tag.
    //   band: String. Filter results by band (either '2.4' or '5').
    //   ssid: Integer. Filter results by SSID number.

    getNetworkWirelessDataRateHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/dataRateHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessDevicesConnectionStats: Aggregated connectivity info for this network, grouped by node
    // GET /networks/{networkId}/wireless/devices/connectionStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-devices-connection-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag

    getNetworkWirelessDevicesConnectionStats (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/devices/connectionStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessDevicesLatencyStats: Aggregated latency info for this network, grouped by node
    // GET /networks/{networkId}/wireless/devices/latencyStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-devices-latency-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag
    //   fields: String. Partial selection: If present, this call will return only the selected fields of ["rawDistribution", "avg"]. All fields will be returned by default. Selected fields must be entered as a comma separated string.

    getNetworkWirelessDevicesLatencyStats (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/devices/latencyStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessFailedConnections: List of all failed client connection events on this network in a given time range
    // GET /networks/{networkId}/wireless/failedConnections

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-failed-connections

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag
    //   serial: String. Filter by AP
    //   clientId: String. Filter by client MAC

    getNetworkWirelessFailedConnections (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/failedConnections", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessLatencyHistory: Return average wireless latency over time for a network, device, or network client
    // GET /networks/{networkId}/wireless/latencyHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-latency-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 300, 600, 1200, 3600, 14400, 86400. The default is 86400.
    //   autoResolution: Boolean. Automatically select a data resolution based on the given timespan; this overrides the value specified by the 'resolution' parameter. The default setting is false.
    //   clientId: String. Filter results by network client.
    //   deviceSerial: String. Filter results by device.
    //   apTag: String. Filter results by AP tag.
    //   band: String. Filter results by band (either '2.4' or '5').
    //   ssid: Integer. Filter results by SSID number.
    //   accessCategory: String. Filter by access category.

    getNetworkWirelessLatencyHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/latencyHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessLatencyStats: Aggregated latency info for this network
    // GET /networks/{networkId}/wireless/latencyStats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-latency-stats

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 180 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 7 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 7 days.
    //   band: String. Filter results by band (either '2.4' or '5'). Note that data prior to February 2020 will not have band information.
    //   ssid: Integer. Filter results by SSID
    //   vlan: Integer. Filter results by VLAN
    //   apTag: String. Filter results by AP Tag
    //   fields: String. Partial selection: If present, this call will return only the selected fields of ["rawDistribution", "avg"]. All fields will be returned by default. Selected fields must be entered as a comma separated string.

    getNetworkWirelessLatencyStats (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/latencyStats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessMeshStatuses: List wireless mesh statuses for repeaters
    // GET /networks/{networkId}/wireless/meshStatuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-mesh-statuses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 500. Default is 50.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getNetworkWirelessMeshStatuses (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/meshStatuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessRfProfiles: List the non-basic RF profiles for this network
    // GET /networks/{networkId}/wireless/rfProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-rf-profiles

    // Query parameters:
    //   includeTemplateProfiles: Boolean. If the network is bound to a template, this parameter controls whether or not the non-basic RF profiles defined on the template should be included in the response alongside the non-basic profiles defined on the bound network. Defaults to false.

    getNetworkWirelessRfProfiles (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/rfProfiles", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkWirelessRfProfile: Creates new RF profile for this network
    // POST /networks/{networkId}/wireless/rfProfiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-wireless-rf-profile

    // Request body schema:
    //   name: String. The name of the new profile. Must be unique. This param is required on creation.
    //   clientBalancingEnabled: Boolean. Steers client to best available access point. Can be either true or false. Defaults to true.
    //   minBitrateType: String. Minimum bitrate can be set to either 'band' or 'ssid'. Defaults to band.
    //   bandSelectionType: String. Band selection can be set to either 'ssid' or 'ap'. This param is required on creation.
    //   apBandSettings: Object. Settings that will be enabled if selectionType is set to 'ap'.
    //   twoFourGhzSettings: Object. Settings related to 2.4Ghz band
    //   fiveGhzSettings: Object. Settings related to 5Ghz band

    createNetworkWirelessRfProfile (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/wireless/rfProfiles", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessRfProfile: Updates specified RF profile for this network
    // PUT /networks/{networkId}/wireless/rfProfiles/{rfProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-rf-profile

    // Request body schema:
    //   name: String. The name of the new profile. Must be unique.
    //   clientBalancingEnabled: Boolean. Steers client to best available access point. Can be either true or false.
    //   minBitrateType: String. Minimum bitrate can be set to either 'band' or 'ssid'.
    //   bandSelectionType: String. Band selection can be set to either 'ssid' or 'ap'.
    //   apBandSettings: Object. Settings that will be enabled if selectionType is set to 'ap'.
    //   twoFourGhzSettings: Object. Settings related to 2.4Ghz band
    //   fiveGhzSettings: Object. Settings related to 5Ghz band

    updateNetworkWirelessRfProfile (self, networkId, rfProfileId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/rfProfiles/" + rfProfileId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkWirelessRfProfile: Delete a RF Profile
    // DELETE /networks/{networkId}/wireless/rfProfiles/{rfProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-wireless-rf-profile

    deleteNetworkWirelessRfProfile (self, networkId, rfProfileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/wireless/rfProfiles/" + rfProfileId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessRfProfile: Return a RF profile
    // GET /networks/{networkId}/wireless/rfProfiles/{rfProfileId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-rf-profile

    getNetworkWirelessRfProfile (self, networkId, rfProfileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/rfProfiles/" + rfProfileId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSettings: Return the wireless settings for a network
    // GET /networks/{networkId}/wireless/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-settings

    getNetworkWirelessSettings (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSettings: Update the wireless settings for a network
    // PUT /networks/{networkId}/wireless/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-settings

    // Request body schema:
    //   meshingEnabled: Boolean. Toggle for enabling or disabling meshing in a network
    //   ipv6BridgeEnabled: Boolean. Toggle for enabling or disabling IPv6 bridging in a network (Note: if enabled, SSIDs must also be configured to use bridge mode)
    //   locationAnalyticsEnabled: Boolean. Toggle for enabling or disabling location analytics for your network
    //   upgradeStrategy: String. The upgrade strategy to apply to the network. Must be one of 'minimizeUpgradeTime' or 'minimizeClientDowntime'. Requires firmware version MR 26.8 or higher'
    //   ledLightsOn: Boolean. Toggle for enabling or disabling LED lights on all APs in the network (making them run dark)

    updateNetworkWirelessSettings (self, networkId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSignalQualityHistory: Return signal quality (SNR/RSSI) over time for a device or network client
    // GET /networks/{networkId}/wireless/signalQualityHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-signal-quality-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 300, 600, 1200, 3600, 14400, 86400. The default is 86400.
    //   autoResolution: Boolean. Automatically select a data resolution based on the given timespan; this overrides the value specified by the 'resolution' parameter. The default setting is false.
    //   clientId: String. Filter results by network client.
    //   deviceSerial: String. Filter results by device.
    //   apTag: String. Filter results by AP tag; either :clientId or :deviceSerial must be jointly specified.
    //   band: String. Filter results by band (either '2.4' or '5').
    //   ssid: Integer. Filter results by SSID number.

    getNetworkWirelessSignalQualityHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/signalQualityHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsids: List the MR SSIDs in a network
    // GET /networks/{networkId}/wireless/ssids

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssids

    getNetworkWirelessSsids (self, networkId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsid: Return a single MR SSID
    // GET /networks/{networkId}/wireless/ssids/{number}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid

    getNetworkWirelessSsid (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsid: Update the attributes of an MR SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid

    // Request body schema:
    //   name: String. The name of the SSID
    //   enabled: Boolean. Whether or not the SSID is enabled
    //   authMode: String. The association control method for the SSID ('open', 'psk', 'open-with-radius', '8021x-meraki', '8021x-radius', '8021x-google', '8021x-localradius', 'ipsk-with-radius' or 'ipsk-without-radius')
    //   enterpriseAdminAccess: String. Whether or not an SSID is accessible by 'enterprise' administrators ('access disabled' or 'access enabled')
    //   encryptionMode: String. The psk encryption mode for the SSID ('wep' or 'wpa'). This param is only valid if the authMode is 'psk'
    //   psk: String. The passkey for the SSID. This param is only valid if the authMode is 'psk'
    //   wpaEncryptionMode: String. The types of WPA encryption. ('WPA1 only', 'WPA1 and WPA2', 'WPA2 only', 'WPA3 Transition Mode' or 'WPA3 only')
    //   dot11w: Object. The current setting for Protected Management Frames (802.11w).
    //   dot11r: Object. The current setting for 802.11r
    //   splashPage: String. The type of splash page for the SSID ('None', 'Click-through splash page', 'Billing', 'Password-protected with Meraki RADIUS', 'Password-protected with custom RADIUS', 'Password-protected with Active Directory', 'Password-protected with LDAP', 'SMS authentication', 'Systems Manager Sentry', 'Facebook Wi-Fi', 'Google OAuth', 'Sponsored guest', 'Cisco ISE' or 'Google Apps domain'). This attribute is not supported for template children.
    //   splashGuestSponsorDomains: Array. Array of valid sponsor email domains for sponsored guest splash type.
    //   oauth: Object. The OAuth settings of this SSID. Only valid if splashPage is 'Google OAuth'.
    //   localRadius: Object. The current setting for Local Authentication, a built-in RADIUS server on the access point. Only valid if authMode is '8021x-localradius'.
    //   ldap: Object. The current setting for LDAP. Only valid if splashPage is 'Password-protected with LDAP'.
    //   activeDirectory: Object. The current setting for Active Directory. Only valid if splashPage is 'Password-protected with Active Directory'
    //   radiusServers: Array. The RADIUS 802.1X servers to be used for authentication. This param is only valid if the authMode is 'open-with-radius', '8021x-radius' or 'ipsk-with-radius'
    //   radiusProxyEnabled: Boolean. If true, Meraki devices will proxy RADIUS messages through the Meraki cloud to the configured RADIUS auth and accounting servers.
    //   radiusTestingEnabled: Boolean. If true, Meraki devices will periodically send Access-Request messages to configured RADIUS servers using identity 'meraki_8021x_test' to ensure that the RADIUS servers are reachable.
    //   radiusCalledStationId: String. The template of the called station identifier to be used for RADIUS (ex. $NODE_MAC$:$VAP_NUM$).
    //   radiusAuthenticationNasId: String. The template of the NAS identifier to be used for RADIUS authentication (ex. $NODE_MAC$:$VAP_NUM$).
    //   radiusServerTimeout: Integer. The amount of time for which a RADIUS client waits for a reply from the RADIUS server (must be between 1-10 seconds).
    //   radiusServerAttemptsLimit: Integer. The maximum number of transmit attempts after which a RADIUS server is failed over (must be between 1-5).
    //   radiusFallbackEnabled: Boolean. Whether or not higher priority RADIUS servers should be retried after 60 seconds.
    //   radiusCoaEnabled: Boolean. If true, Meraki devices will act as a RADIUS Dynamic Authorization Server and will respond to RADIUS Change-of-Authorization and Disconnect messages sent by the RADIUS server.
    //   radiusFailoverPolicy: String. This policy determines how authentication requests should be handled in the event that all of the configured RADIUS servers are unreachable ('Deny access' or 'Allow access')
    //   radiusLoadBalancingPolicy: String. This policy determines which RADIUS server will be contacted first in an authentication attempt and the ordering of any necessary retry attempts ('Strict priority order' or 'Round robin')
    //   radiusAccountingEnabled: Boolean. Whether or not RADIUS accounting is enabled. This param is only valid if the authMode is 'open-with-radius', '8021x-radius' or 'ipsk-with-radius'
    //   radiusAccountingServers: Array. The RADIUS accounting 802.1X servers to be used for authentication. This param is only valid if the authMode is 'open-with-radius', '8021x-radius' or 'ipsk-with-radius' and radiusAccountingEnabled is 'true'
    //   radiusAccountingInterimInterval: Integer. The interval (in seconds) in which accounting information is updated and sent to the RADIUS accounting server.
    //   radiusAttributeForGroupPolicies: String. Specify the RADIUS attribute used to look up group policies ('Filter-Id', 'Reply-Message', 'Airespace-ACL-Name' or 'Aruba-User-Role'). Access points must receive this attribute in the RADIUS Access-Accept message
    //   ipAssignmentMode: String. The client IP assignment mode ('NAT mode', 'Bridge mode', 'Layer 3 roaming', 'Layer 3 roaming with a concentrator' or 'VPN')
    //   useVlanTagging: Boolean. Whether or not traffic should be directed to use specific VLANs. This param is only valid if the ipAssignmentMode is 'Bridge mode' or 'Layer 3 roaming'
    //   concentratorNetworkId: String. The concentrator to use when the ipAssignmentMode is 'Layer 3 roaming with a concentrator' or 'VPN'.
    //   vlanId: Integer. The VLAN ID used for VLAN tagging. This param is only valid when the ipAssignmentMode is 'Layer 3 roaming with a concentrator' or 'VPN'
    //   defaultVlanId: Integer. The default VLAN ID used for 'all other APs'. This param is only valid when the ipAssignmentMode is 'Bridge mode' or 'Layer 3 roaming'
    //   apTagsAndVlanIds: Array. The list of tags and VLAN IDs used for VLAN tagging. This param is only valid when the ipAssignmentMode is 'Bridge mode' or 'Layer 3 roaming'
    //   walledGardenEnabled: Boolean. Allow access to a configurable list of IP ranges, which users may access prior to sign-on.
    //   walledGardenRanges: Array. Specify your walled garden by entering an array of addresses, ranges using CIDR notation, domain names, and domain wildcards (e.g. '192.168.1.1/24', '192.168.37.10/32', 'www.yahoo.com', '*.google.com']). Meraki's splash page is automatically included in your walled garden.
    //   radiusOverride: Boolean. If true, the RADIUS response can override VLAN tag. This is not valid when ipAssignmentMode is 'NAT mode'.
    //   radiusGuestVlanEnabled: Boolean. Whether or not RADIUS Guest VLAN is enabled. This param is only valid if the authMode is 'open-with-radius' and addressing mode is not set to 'isolated' or 'nat' mode
    //   radiusGuestVlanId: Integer. VLAN ID of the RADIUS Guest VLAN. This param is only valid if the authMode is 'open-with-radius' and addressing mode is not set to 'isolated' or 'nat' mode
    //   minBitrate: Number. The minimum bitrate in Mbps. ('1', '2', '5.5', '6', '9', '11', '12', '18', '24', '36', '48' or '54')
    //   bandSelection: String. The client-serving radio frequencies. ('Dual band operation', '5 GHz band only' or 'Dual band operation with Band Steering')
    //   perClientBandwidthLimitUp: Integer. The upload bandwidth limit in Kbps. (0 represents no limit.)
    //   perClientBandwidthLimitDown: Integer. The download bandwidth limit in Kbps. (0 represents no limit.)
    //   perSsidBandwidthLimitUp: Integer. The total upload bandwidth limit in Kbps. (0 represents no limit.)
    //   perSsidBandwidthLimitDown: Integer. The total download bandwidth limit in Kbps. (0 represents no limit.)
    //   lanIsolationEnabled: Boolean. Boolean indicating whether Layer 2 LAN isolation should be enabled or disabled. Only configurable when ipAssignmentMode is 'Bridge mode'.
    //   visible: Boolean. Boolean indicating whether APs should advertise or hide this SSID. APs will only broadcast this SSID if set to true
    //   availableOnAllAps: Boolean. Boolean indicating whether all APs should broadcast the SSID or if it should be restricted to APs matching any availability tags. Can only be false if the SSID has availability tags.
    //   availabilityTags: Array. Accepts a list of tags for this SSID. If availableOnAllAps is false, then the SSID will only be broadcast by APs with tags matching any of the tags in this list.
    //   mandatoryDhcpEnabled: Boolean. If true, Mandatory DHCP will enforce that clients connecting to this SSID must use the IP address assigned by the DHCP server. Clients who use a static IP address won't be able to associate.
    //   adultContentFilteringEnabled: Boolean. Boolean indicating whether or not adult content will be blocked
    //   dnsRewrite: Object. DNS servers rewrite settings

    updateNetworkWirelessSsid (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidBonjourForwarding: List the Bonjour forwarding setting and rules for the SSID
    // GET /networks/{networkId}/wireless/ssids/{number}/bonjourForwarding

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-bonjour-forwarding

    getNetworkWirelessSsidBonjourForwarding (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/bonjourForwarding")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidBonjourForwarding: Update the bonjour forwarding setting and rules for the SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}/bonjourForwarding

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-bonjour-forwarding

    // Request body schema:
    //   enabled: Boolean. If true, Bonjour forwarding is enabled on this SSID.
    //   rules: Array. List of bonjour forwarding rules.

    updateNetworkWirelessSsidBonjourForwarding (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/bonjourForwarding", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidDeviceTypeGroupPolicies: List the device type group policies for the SSID
    // GET /networks/{networkId}/wireless/ssids/{number}/deviceTypeGroupPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-device-type-group-policies

    getNetworkWirelessSsidDeviceTypeGroupPolicies (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/deviceTypeGroupPolicies")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidDeviceTypeGroupPolicies: Update the device type group policies for the SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}/deviceTypeGroupPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-device-type-group-policies

    // Request body schema:
    //   enabled: Boolean. If true, the SSID device type group policies are enabled.
    //   deviceTypePolicies: Array. List of device type policies.

    updateNetworkWirelessSsidDeviceTypeGroupPolicies (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/deviceTypeGroupPolicies", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidEapOverride: Return the EAP overridden parameters for an SSID
    // GET /networks/{networkId}/wireless/ssids/{number}/eapOverride

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-eap-override

    getNetworkWirelessSsidEapOverride (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/eapOverride")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidEapOverride: Update the EAP overridden parameters for an SSID.
    // PUT /networks/{networkId}/wireless/ssids/{number}/eapOverride

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-eap-override

    // Request body schema:
    //   timeout: Integer. General EAP timeout in seconds.
    //   identity: Object. EAP settings for identity requests.
    //   maxRetries: Integer. Maximum number of general EAP retries.
    //   eapolKey: Object. EAPOL Key settings.

    updateNetworkWirelessSsidEapOverride (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/eapOverride", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidFirewallL3FirewallRules: Return the L3 firewall rules for an SSID on an MR network
    // GET /networks/{networkId}/wireless/ssids/{number}/firewall/l3FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-firewall-l3-firewall-rules

    getNetworkWirelessSsidFirewallL3FirewallRules (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/firewall/l3FirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidFirewallL3FirewallRules: Update the L3 firewall rules of an SSID on an MR network
    // PUT /networks/{networkId}/wireless/ssids/{number}/firewall/l3FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-firewall-l3-firewall-rules

    // Request body schema:
    //   rules: Array. An ordered array of the firewall rules for this SSID (not including the local LAN access rule or the default rule)
    //   allowLanAccess: Boolean. Allow wireless client access to local LAN (boolean value - true allows access and false denies access) (optional)

    updateNetworkWirelessSsidFirewallL3FirewallRules (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/firewall/l3FirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidFirewallL7FirewallRules: Return the L7 firewall rules for an SSID on an MR network
    // GET /networks/{networkId}/wireless/ssids/{number}/firewall/l7FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-firewall-l7-firewall-rules

    getNetworkWirelessSsidFirewallL7FirewallRules (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/firewall/l7FirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidFirewallL7FirewallRules: Update the L7 firewall rules of an SSID on an MR network
    // PUT /networks/{networkId}/wireless/ssids/{number}/firewall/l7FirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-firewall-l7-firewall-rules

    // Request body schema:
    //   rules: Array. An array of L7 firewall rules for this SSID. Rules will get applied in the same order user has specified in request. Empty array will clear the L7 firewall rule configuration.

    updateNetworkWirelessSsidFirewallL7FirewallRules (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/firewall/l7FirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidHotspot20: Return the Hotspot 2.0 settings for an SSID
    // GET /networks/{networkId}/wireless/ssids/{number}/hotspot20

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-hotspot20

    getNetworkWirelessSsidHotspot20 (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/hotspot20")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidHotspot20: Update the Hotspot 2.0 settings of an SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}/hotspot20

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-hotspot20

    // Request body schema:
    //   enabled: Boolean. Whether or not Hotspot 2.0 for this SSID is enabled
    //   operator: Object. Operator settings for this SSID
    //   venue: Object. Venue settings for this SSID
    //   networkAccessType: String. The network type of this SSID ('Private network', 'Private network with guest access', 'Chargeable public network', 'Free public network', 'Personal device network', 'Emergency services only network', 'Test or experimental', 'Wildcard')
    //   domains: Array. An array of domain names
    //   roamConsortOis: Array. An array of roaming consortium OIs (hexadecimal number 3-5 octets in length)
    //   mccMncs: Array. An array of MCC/MNC pairs
    //   naiRealms: Array. An array of NAI realms

    updateNetworkWirelessSsidHotspot20 (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/hotspot20", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidIdentityPsks: List all Identity PSKs in a wireless network
    // GET /networks/{networkId}/wireless/ssids/{number}/identityPsks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-identity-psks

    getNetworkWirelessSsidIdentityPsks (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/identityPsks")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createNetworkWirelessSsidIdentityPsk: Create an Identity PSK
    // POST /networks/{networkId}/wireless/ssids/{number}/identityPsks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-network-wireless-ssid-identity-psk

    // Request body schema:
    //   name: String. The name of the Identity PSK
    //   passphrase: String. The passphrase for client authentication. If left blank, one will be auto-generated.
    //   groupPolicyId: String. The group policy to be applied to clients

    createNetworkWirelessSsidIdentityPsk (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/networks/" + networkId + "/wireless/ssids/" + number + "/identityPsks", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidIdentityPsk: Return an Identity PSK
    // GET /networks/{networkId}/wireless/ssids/{number}/identityPsks/{identityPskId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-identity-psk

    getNetworkWirelessSsidIdentityPsk (self, networkId, number, identityPskId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/identityPsks/" + identityPskId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidIdentityPsk: Update an Identity PSK
    // PUT /networks/{networkId}/wireless/ssids/{number}/identityPsks/{identityPskId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-identity-psk

    // Request body schema:
    //   name: String. The name of the Identity PSK
    //   passphrase: String. The passphrase for client authentication
    //   groupPolicyId: String. The group policy to be applied to clients

    updateNetworkWirelessSsidIdentityPsk (self, networkId, number, identityPskId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/identityPsks/" + identityPskId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteNetworkWirelessSsidIdentityPsk: Delete an Identity PSK
    // DELETE /networks/{networkId}/wireless/ssids/{number}/identityPsks/{identityPskId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-network-wireless-ssid-identity-psk

    deleteNetworkWirelessSsidIdentityPsk (self, networkId, number, identityPskId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/networks/" + networkId + "/wireless/ssids/" + number + "/identityPsks/" + identityPskId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidSchedules: List the outage schedule for the SSID
    // GET /networks/{networkId}/wireless/ssids/{number}/schedules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-schedules

    getNetworkWirelessSsidSchedules (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/schedules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidSchedules: Update the outage schedule for the SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}/schedules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-schedules

    // Request body schema:
    //   enabled: Boolean. If true, the SSID outage schedule is enabled.
    //   ranges: Array. List of outage ranges. Has a start date and time, and end date and time. If this parameter is passed in along with rangesInSeconds parameter, this will take precedence.
    //   rangesInSeconds: Array. List of outage ranges in seconds since Sunday at Midnight. Has a start and end. If this parameter is passed in along with the ranges parameter, ranges will take precedence.

    updateNetworkWirelessSsidSchedules (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/schedules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidSplashSettings: Display the splash page settings for the given SSID
    // GET /networks/{networkId}/wireless/ssids/{number}/splash/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-splash-settings

    getNetworkWirelessSsidSplashSettings (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/splash/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidSplashSettings: Modify the splash page settings for the given SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}/splash/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-splash-settings

    // Request body schema:
    //   splashUrl: String. [optional] The custom splash URL of the click-through splash page. Note that the URL can be configured without necessarily being used. In order to enable the custom URL, see 'useSplashUrl'
    //   useSplashUrl: Boolean. [optional] Boolean indicating whether the users will be redirected to the custom splash url. A custom splash URL must be set if this is true. Note that depending on your SSID's access control settings, it may not be possible to use the custom splash URL.
    //   splashTimeout: Integer. Splash timeout in minutes. This will determine how often users will see the splash page.
    //   redirectUrl: String. The custom redirect URL where the users will go after the splash page.
    //   useRedirectUrl: Boolean. The Boolean indicating whether the the user will be redirected to the custom redirect URL after the splash page. A custom redirect URL must be set if this is true.
    //   welcomeMessage: String. The welcome message for the users on the splash page.
    //   splashLogo: Object. The logo used in the splash page.
    //   splashImage: Object. The image used in the splash page.
    //   splashPrepaidFront: Object. The prepaid front image used in the splash page.
    //   blockAllTrafficBeforeSignOn: Boolean. How restricted allowing traffic should be. If true, all traffic types are blocked until the splash page is acknowledged. If false, all non-HTTP traffic is allowed before the splash page is acknowledged.
    //   controllerDisconnectionBehavior: String. How login attempts should be handled when the controller is unreachable. Can be either 'open', 'restricted', or 'default'.
    //   allowSimultaneousLogins: Boolean. Whether or not to allow simultaneous logins from different devices.
    //   guestSponsorship: Object. Details associated with guest sponsored splash.
    //   billing: Object. Details associated with billing splash.
    //   sentryEnrollment: Object. Systems Manager sentry enrollment splash settings.

    updateNetworkWirelessSsidSplashSettings (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/splash/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidTrafficShapingRules: Update the traffic shaping settings for an SSID on an MR network
    // PUT /networks/{networkId}/wireless/ssids/{number}/trafficShaping/rules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-traffic-shaping-rules

    // Request body schema:
    //   trafficShapingEnabled: Boolean. Whether traffic shaping rules are applied to clients on your SSID.
    //   defaultRulesEnabled: Boolean. Whether default traffic shaping rules are enabled (true) or disabled (false). There are 4 default rules, which can be seen on your network's traffic shaping page. Note that default rules count against the rule limit of 8.
    //   rules: Array.     An array of traffic shaping rules. Rules are applied in the order that     they are specified in. An empty list (or null) means no rules. Note that     you are allowed a maximum of 8 rules. 

    updateNetworkWirelessSsidTrafficShapingRules (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/trafficShaping/rules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidTrafficShapingRules: Display the traffic shaping settings for a SSID on an MR network
    // GET /networks/{networkId}/wireless/ssids/{number}/trafficShaping/rules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-traffic-shaping-rules

    getNetworkWirelessSsidTrafficShapingRules (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/trafficShaping/rules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessSsidVpn: List the VPN settings for the SSID.
    // GET /networks/{networkId}/wireless/ssids/{number}/vpn

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-ssid-vpn

    getNetworkWirelessSsidVpn (self, networkId, number) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/ssids/" + number + "/vpn")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateNetworkWirelessSsidVpn: Update the VPN settings for the SSID
    // PUT /networks/{networkId}/wireless/ssids/{number}/vpn

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-network-wireless-ssid-vpn

    // Request body schema:
    //   splitTunnel: Object. The VPN split tunnel settings for this SSID.

    updateNetworkWirelessSsidVpn (self, networkId, number, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/networks/" + networkId + "/wireless/ssids/" + number + "/vpn", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getNetworkWirelessUsageHistory: Return AP usage over time for a device or network client
    // GET /networks/{networkId}/wireless/usageHistory

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-network-wireless-usage-history

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 7 days.
    //   resolution: Integer. The time resolution in seconds for returned data. The valid resolutions are: 300, 600, 1200, 3600, 14400, 86400. The default is 86400.
    //   autoResolution: Boolean. Automatically select a data resolution based on the given timespan; this overrides the value specified by the 'resolution' parameter. The default setting is false.
    //   clientId: String. Filter results by network client to return per-device AP usage over time inner joined by the queried client's connection history.
    //   deviceSerial: String. Filter results by device. Requires :band.
    //   apTag: String. Filter results by AP tag; either :clientId or :deviceSerial must be jointly specified.
    //   band: String. Filter results by band (either '2.4' or '5').
    //   ssid: Integer. Filter results by SSID number.

    getNetworkWirelessUsageHistory (self, networkId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/networks/" + networkId + "/wireless/usageHistory", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizations: List the organizations that the user has privileges on
    // GET /organizations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organizations

    getOrganizations (self) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganization: Create a new organization
    // POST /organizations

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization

    // Request body schema:
    //   name: String. The name of the organization

    createOrganization (self, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganization: Return an organization
    // GET /organizations/{organizationId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization

    getOrganization (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganization: Update an organization
    // PUT /organizations/{organizationId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization

    // Request body schema:
    //   name: String. The name of the organization
    //   api: Object. API-specific settings

    updateOrganization (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganization: Delete an organization
    // DELETE /organizations/{organizationId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization

    deleteOrganization (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationActionBatch: Create an action batch
    // POST /organizations/{organizationId}/actionBatches

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-action-batch

    // Request body schema:
    //   confirmed: Boolean. Set to true for immediate execution. Set to false if the action should be previewed before executing. This property cannot be unset once it is true. Defaults to false.
    //   synchronous: Boolean. Set to true to force the batch to run synchronous. There can be at most 20 actions in synchronous batch. Defaults to false.
    //   actions: Array. A set of changes to make as part of this action (<a href='https://developer.cisco.com/meraki/api/#/rest/guides/action-batches/'>more details</a>)

    createOrganizationActionBatch (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/actionBatches", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationActionBatches: Return the list of action batches in the organization
    // GET /organizations/{organizationId}/actionBatches

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-action-batches

    // Query parameters:
    //   status: String. Filter batches by status. Valid types are pending, completed, and failed.

    getOrganizationActionBatches (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/actionBatches", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationActionBatch: Return an action batch
    // GET /organizations/{organizationId}/actionBatches/{actionBatchId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-action-batch

    getOrganizationActionBatch (self, organizationId, actionBatchId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/actionBatches/" + actionBatchId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationActionBatch: Delete an action batch
    // DELETE /organizations/{organizationId}/actionBatches/{actionBatchId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-action-batch

    deleteOrganizationActionBatch (self, organizationId, actionBatchId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/actionBatches/" + actionBatchId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationActionBatch: Update an action batch
    // PUT /organizations/{organizationId}/actionBatches/{actionBatchId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-action-batch

    // Request body schema:
    //   confirmed: Boolean. A boolean representing whether or not the batch has been confirmed. This property cannot be unset once it is true.
    //   synchronous: Boolean. Set to true to force the batch to run synchronous. There can be at most 20 actions in synchronous batch.

    updateOrganizationActionBatch (self, organizationId, actionBatchId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/actionBatches/" + actionBatchId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationAdaptivePolicyAcls: List adaptive policy ACLs in a organization
    // GET /organizations/{organizationId}/adaptivePolicy/acls

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-adaptive-policy-acls

    getOrganizationAdaptivePolicyAcls (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/adaptivePolicy/acls")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationAdaptivePolicyAcl: Creates new adaptive policy ACL
    // POST /organizations/{organizationId}/adaptivePolicy/acls

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-adaptive-policy-acl

    // Request body schema:
    //   name: String. Name of the adaptive policy ACL
    //   description: String. Description of the adaptive policy ACL
    //   rules: Array. An ordered array of the adaptive policy ACL rules.
    //   ipVersion: String. IP version of adpative policy ACL. One of: 'any', 'ipv4' or 'ipv6'

    createOrganizationAdaptivePolicyAcl (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/adaptivePolicy/acls", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationAdaptivePolicyAcl: Returns the adaptive policy ACL information
    // GET /organizations/{organizationId}/adaptivePolicy/acls/{id}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-adaptive-policy-acl

    getOrganizationAdaptivePolicyAcl (self, organizationId, id) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/adaptivePolicy/acls/" + id)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationAdaptivePolicyAcl: Updates an adaptive policy ACL
    // PUT /organizations/{organizationId}/adaptivePolicy/acls/{id}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-adaptive-policy-acl

    // Request body schema:
    //   name: String. Name of the adaptive policy ACL
    //   description: String. Description of the adaptive policy ACL
    //   rules: Array. An ordered array of the adaptive policy ACL rules. An empty array will clear the rules.
    //   ipVersion: String. IP version of adpative policy ACL. One of: 'any', 'ipv4' or 'ipv6'

    updateOrganizationAdaptivePolicyAcl (self, organizationId, id, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/adaptivePolicy/acls/" + id, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationAdaptivePolicyAcl: Deletes the specified adaptive policy ACL. Note this adaptive policy ACL will also be removed from policies using it.
    // DELETE /organizations/{organizationId}/adaptivePolicy/acls/{id}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-adaptive-policy-acl

    deleteOrganizationAdaptivePolicyAcl (self, organizationId, id) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/adaptivePolicy/acls/" + id)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationAdaptivePolicySettings: Returns global adaptive policy settings in an organization
    // GET /organizations/{organizationId}/adaptivePolicy/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-adaptive-policy-settings

    getOrganizationAdaptivePolicySettings (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/adaptivePolicy/settings")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationAdaptivePolicySettings: Update global adaptive policy settings
    // PUT /organizations/{organizationId}/adaptivePolicy/settings

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-adaptive-policy-settings

    // Request body schema:
    //   enabledNetworks: Array. List of network IDs with adaptive policy enabled

    updateOrganizationAdaptivePolicySettings (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/adaptivePolicy/settings", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationAdmins: List the dashboard administrators in this organization
    // GET /organizations/{organizationId}/admins

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-admins

    getOrganizationAdmins (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/admins")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationAdmin: Create a new dashboard administrator
    // POST /organizations/{organizationId}/admins

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-admin

    // Request body schema:
    //   email: String. The email of the dashboard administrator. This attribute can not be updated.
    //   name: String. The name of the dashboard administrator
    //   orgAccess: String. The privilege of the dashboard administrator on the organization. Can be one of 'full', 'read-only', 'enterprise' or 'none'
    //   tags: Array. The list of tags that the dashboard administrator has privileges on
    //   networks: Array. The list of networks that the dashboard administrator has privileges on
    //   authenticationMethod: String. The method of authentication the user will use to sign in to the Meraki dashboard. Can be one of 'Email' or 'Cisco SecureX Sign-On'. The default is Email authentication

    createOrganizationAdmin (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/admins", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationAdmin: Update an administrator
    // PUT /organizations/{organizationId}/admins/{adminId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-admin

    // Request body schema:
    //   name: String. The name of the dashboard administrator
    //   orgAccess: String. The privilege of the dashboard administrator on the organization. Can be one of 'full', 'read-only', 'enterprise' or 'none'
    //   tags: Array. The list of tags that the dashboard administrator has privileges on
    //   networks: Array. The list of networks that the dashboard administrator has privileges on

    updateOrganizationAdmin (self, organizationId, adminId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/admins/" + adminId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationAdmin: Revoke all access for a dashboard administrator within this organization
    // DELETE /organizations/{organizationId}/admins/{adminId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-admin

    deleteOrganizationAdmin (self, organizationId, adminId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/admins/" + adminId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApiRequests: List the API requests made by an organization
    // GET /organizations/{organizationId}/apiRequests

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-api-requests

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 31 days.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 50.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   adminId: String. Filter the results by the ID of the admin who made the API requests
    //   path: String. Filter the results by the path of the API requests
    //   method: String. Filter the results by the method of the API requests (must be 'GET', 'PUT', 'POST' or 'DELETE')
    //   responseCode: Integer. Filter the results by the response code of the API requests
    //   sourceIp: String. Filter the results by the IP address of the originating API request

    getOrganizationApiRequests (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/apiRequests", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApiRequestsOverview: Return an aggregated overview of API requests data
    // GET /organizations/{organizationId}/apiRequests/overview

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-api-requests-overview

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 31 days.

    getOrganizationApiRequestsOverview (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/apiRequests/overview", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceSecurityEvents: List the security events for an organization
    // GET /organizations/{organizationId}/appliance/security/events

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-security-events

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. Data is gathered after the specified t0 value. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 365 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 365 days. The default is 31 days.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 100.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   sortOrder: String. Sorted order of security events based on event detection time. Order options are 'ascending' or 'descending'. Default is ascending order.

    getOrganizationApplianceSecurityEvents (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/security/events", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceSecurityIntrusion: Returns all supported intrusion settings for an organization
    // GET /organizations/{organizationId}/appliance/security/intrusion

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-security-intrusion

    getOrganizationApplianceSecurityIntrusion (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/security/intrusion")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationApplianceSecurityIntrusion: Sets supported intrusion settings for an organization
    // PUT /organizations/{organizationId}/appliance/security/intrusion

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-appliance-security-intrusion

    // Request body schema:
    //   allowedRules: Array. Sets a list of specific SNORT signatures to allow

    updateOrganizationApplianceSecurityIntrusion (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/appliance/security/intrusion", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceUplinkStatuses: List the uplink status of every Meraki MX and Z series appliances in the organization
    // GET /organizations/{organizationId}/appliance/uplink/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-uplink-statuses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   networkIds: Array. A list of network IDs. The returned devices will be filtered to only include these networks.
    //   serials: Array. A list of serial numbers. The returned devices will be filtered to only include these serials.
    //   iccids: Array. A list of ICCIDs. The returned devices will be filtered to only include these ICCIDs.

    getOrganizationApplianceUplinkStatuses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/uplink/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceVpnStats: Show VPN history stat for networks in an organization
    // GET /organizations/{organizationId}/appliance/vpn/stats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-vpn-stats

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 300. Default is 300.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   networkIds: Array. A list of Meraki network IDs to filter results to contain only specified networks. E.g.: networkIds[]=N_12345678&networkIds[]=L_3456
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 31 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.

    getOrganizationApplianceVpnStats (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/vpn/stats", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceVpnStatuses: Show VPN status for networks in an organization
    // GET /organizations/{organizationId}/appliance/vpn/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-vpn-statuses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 300. Default is 300.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   networkIds: Array. A list of Meraki network IDs to filter results to contain only specified networks. E.g.: networkIds[]=N_12345678&networkIds[]=L_3456

    getOrganizationApplianceVpnStatuses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/vpn/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceVpnThirdPartyVPNPeers: Return the third party VPN peers for an organization
    // GET /organizations/{organizationId}/appliance/vpn/thirdPartyVPNPeers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-vpn-third-party-v-p-n-peers

    getOrganizationApplianceVpnThirdPartyVPNPeers (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/vpn/thirdPartyVPNPeers")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationApplianceVpnThirdPartyVPNPeers: Update the third party VPN peers for an organization
    // PUT /organizations/{organizationId}/appliance/vpn/thirdPartyVPNPeers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-appliance-vpn-third-party-v-p-n-peers

    // Request body schema:
    //   peers: Array. The list of VPN peers

    updateOrganizationApplianceVpnThirdPartyVPNPeers (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/appliance/vpn/thirdPartyVPNPeers", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationApplianceVpnVpnFirewallRules: Return the firewall rules for an organization's site-to-site VPN
    // GET /organizations/{organizationId}/appliance/vpn/vpnFirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-appliance-vpn-vpn-firewall-rules

    getOrganizationApplianceVpnVpnFirewallRules (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/appliance/vpn/vpnFirewallRules")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationApplianceVpnVpnFirewallRules: Update the firewall rules of an organization's site-to-site VPN
    // PUT /organizations/{organizationId}/appliance/vpn/vpnFirewallRules

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-appliance-vpn-vpn-firewall-rules

    // Request body schema:
    //   rules: Array. An ordered array of the firewall rules (not including the default rule)
    //   syslogDefaultRule: Boolean. Log the special default rule (boolean value - enable only if you've configured a syslog server) (optional)

    updateOrganizationApplianceVpnVpnFirewallRules (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/appliance/vpn/vpnFirewallRules", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationBrandingPolicies: List the branding policies of an organization
    // GET /organizations/{organizationId}/brandingPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-branding-policies

    getOrganizationBrandingPolicies (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/brandingPolicies")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationBrandingPolicy: Add a new branding policy to an organization
    // POST /organizations/{organizationId}/brandingPolicies

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-branding-policy

    // Request body schema:
    //   name: String. Name of the Dashboard branding policy.
    //   enabled: Boolean. Boolean indicating whether this policy is enabled.
    //   adminSettings: Object. Settings for describing which kinds of admins this policy applies to.
    //   helpSettings: Object.     Settings for describing the modifications to various Help page features. Each property in this object accepts one of     'default or inherit' (do not modify functionality), 'hide' (remove the section from Dashboard), or 'show' (always show     the section on Dashboard). Some properties in this object also accept custom HTML used to replace the section on     Dashboard; see the documentation for each property to see the allowed values.  Each property defaults to 'default or inherit' when not provided.

    createOrganizationBrandingPolicy (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/brandingPolicies", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationBrandingPoliciesPriorities: Return the branding policy IDs of an organization in priority order. IDs are ordered in ascending order of priority (IDs later in the array have higher priority).
    // GET /organizations/{organizationId}/brandingPolicies/priorities

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-branding-policies-priorities

    getOrganizationBrandingPoliciesPriorities (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/brandingPolicies/priorities")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationBrandingPoliciesPriorities: Update the priority ordering of an organization's branding policies.
    // PUT /organizations/{organizationId}/brandingPolicies/priorities

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-branding-policies-priorities

    // Request body schema:
    //   brandingPolicyIds: Array. A list of branding policy IDs arranged in ascending priority order (IDs later in the array have higher priority).

    updateOrganizationBrandingPoliciesPriorities (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/brandingPolicies/priorities", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationBrandingPolicy: Return a branding policy
    // GET /organizations/{organizationId}/brandingPolicies/{brandingPolicyId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-branding-policy

    getOrganizationBrandingPolicy (self, organizationId, brandingPolicyId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/brandingPolicies/" + brandingPolicyId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationBrandingPolicy: Update a branding policy
    // PUT /organizations/{organizationId}/brandingPolicies/{brandingPolicyId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-branding-policy

    // Request body schema:
    //   name: String. Name of the Dashboard branding policy.
    //   enabled: Boolean. Boolean indicating whether this policy is enabled.
    //   adminSettings: Object. Settings for describing which kinds of admins this policy applies to.
    //   helpSettings: Object.     Settings for describing the modifications to various Help page features. Each property in this object accepts one of     'default or inherit' (do not modify functionality), 'hide' (remove the section from Dashboard), or 'show' (always show     the section on Dashboard). Some properties in this object also accept custom HTML used to replace the section on     Dashboard; see the documentation for each property to see the allowed values. 

    updateOrganizationBrandingPolicy (self, organizationId, brandingPolicyId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/brandingPolicies/" + brandingPolicyId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationBrandingPolicy: Delete a branding policy
    // DELETE /organizations/{organizationId}/brandingPolicies/{brandingPolicyId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-branding-policy

    deleteOrganizationBrandingPolicy (self, organizationId, brandingPolicyId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/brandingPolicies/" + brandingPolicyId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationCameraOnboardingStatuses: Fetch onboarding status of cameras
    // GET /organizations/{organizationId}/camera/onboarding/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-camera-onboarding-statuses

    // Query parameters:
    //   serials: Array. A list of serial numbers. The returned cameras will be filtered to only include these serials.
    //   networkIds: Array. A list of network IDs. The returned cameras will be filtered to only include these networks.

    getOrganizationCameraOnboardingStatuses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/camera/onboarding/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationCameraOnboardingStatuses: Notify that credential handoff to camera has completed
    // PUT /organizations/{organizationId}/camera/onboarding/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-camera-onboarding-statuses

    // Request body schema:
    //   serial: String. Serial of camera
    //   wirelessCredentialsSent: Boolean. Note whether credentials were sent successfully

    updateOrganizationCameraOnboardingStatuses (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/camera/onboarding/statuses", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationCellularGatewayUplinkStatuses: List the uplink status of every Meraki MG cellular gateway in the organization
    // GET /organizations/{organizationId}/cellularGateway/uplink/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-cellular-gateway-uplink-statuses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   networkIds: Array. A list of network IDs. The returned devices will be filtered to only include these networks.
    //   serials: Array. A list of serial numbers. The returned devices will be filtered to only include these serials.
    //   iccids: Array. A list of ICCIDs. The returned devices will be filtered to only include these ICCIDs.

    getOrganizationCellularGatewayUplinkStatuses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/cellularGateway/uplink/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // claimIntoOrganization: Claim a list of devices, licenses, and/or orders into an organization. When claiming by order, all devices and licenses in the order will be claimed; licenses will be added to the organization and devices will be placed in the organization's inventory.
    // POST /organizations/{organizationId}/claim

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!claim-into-organization

    // Request body schema:
    //   orders: Array. The numbers of the orders that should be claimed
    //   serials: Array. The serials of the devices that should be claimed
    //   licenses: Array. The licenses that should be claimed

    claimIntoOrganization (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/claim", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // cloneOrganization: Create a new organization by cloning the addressed organization
    // POST /organizations/{organizationId}/clone

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!clone-organization

    // Request body schema:
    //   name: String. The name of the new organization

    cloneOrganization (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/clone", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationConfigTemplates: List the configuration templates for this organization
    // GET /organizations/{organizationId}/configTemplates

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-config-templates

    getOrganizationConfigTemplates (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/configTemplates")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationConfigTemplate: Create a new configuration template
    // POST /organizations/{organizationId}/configTemplates

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-config-template

    // Request body schema:
    //   name: String. The name of the configuration template
    //   timeZone: String. The timezone of the configuration template. For a list of allowed timezones, please see the 'TZ' column in the table in <a target='_blank' href='https://en.wikipedia.org/wiki/List_of_tz_database_time_zones'>this article</a>. Not applicable if copying from existing network or template
    //   copyFromNetworkId: String. The ID of the network or config template to copy configuration from

    createOrganizationConfigTemplate (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/configTemplates", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationConfigTemplate: Update a configuration template
    // PUT /organizations/{organizationId}/configTemplates/{configTemplateId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-config-template

    // Request body schema:
    //   name: String. The name of the configuration template
    //   timeZone: String. The timezone of the configuration template. For a list of allowed timezones, please see the 'TZ' column in the table in <a target='_blank' href='https://en.wikipedia.org/wiki/List_of_tz_database_time_zones'>this article.</a>

    updateOrganizationConfigTemplate (self, organizationId, configTemplateId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationConfigTemplate: Remove a configuration template
    // DELETE /organizations/{organizationId}/configTemplates/{configTemplateId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-config-template

    deleteOrganizationConfigTemplate (self, organizationId, configTemplateId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationConfigTemplate: Return a single configuration template
    // GET /organizations/{organizationId}/configTemplates/{configTemplateId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-config-template

    getOrganizationConfigTemplate (self, organizationId, configTemplateId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationConfigTemplateSwitchProfiles: List the switch profiles for your switch template configuration
    // GET /organizations/{organizationId}/configTemplates/{configTemplateId}/switch/profiles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-config-template-switch-profiles

    getOrganizationConfigTemplateSwitchProfiles (self, organizationId, configTemplateId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId + "/switch/profiles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationConfigTemplateSwitchProfilePorts: Return all the ports of a switch profile
    // GET /organizations/{organizationId}/configTemplates/{configTemplateId}/switch/profiles/{profileId}/ports

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-config-template-switch-profile-ports

    getOrganizationConfigTemplateSwitchProfilePorts (self, organizationId, configTemplateId, profileId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId + "/switch/profiles/" + profileId + "/ports")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationConfigTemplateSwitchProfilePort: Return a switch profile port
    // GET /organizations/{organizationId}/configTemplates/{configTemplateId}/switch/profiles/{profileId}/ports/{portId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-config-template-switch-profile-port

    getOrganizationConfigTemplateSwitchProfilePort (self, organizationId, configTemplateId, profileId, portId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId + "/switch/profiles/" + profileId + "/ports/" + portId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationConfigTemplateSwitchProfilePort: Update a switch profile port
    // PUT /organizations/{organizationId}/configTemplates/{configTemplateId}/switch/profiles/{profileId}/ports/{portId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-config-template-switch-profile-port

    // Request body schema:
    //   name: String. The name of the switch profile port
    //   tags: Array. The list of tags of the switch profile port
    //   enabled: Boolean. The status of the switch profile port
    //   type: String. The type of the switch profile port ('trunk' or 'access')
    //   vlan: Integer. The VLAN of the switch profile port. A null value will clear the value set for trunk ports.
    //   voiceVlan: Integer. The voice VLAN of the switch profile port. Only applicable to access ports
    //   allowedVlans: String. The VLANs allowed on the switch profile port. Only applicable to trunk ports
    //   poeEnabled: Boolean. The PoE status of the switch profile port
    //   isolationEnabled: Boolean. The isolation status of the switch profile port
    //   rstpEnabled: Boolean. The rapid spanning tree protocol status
    //   stpGuard: String. The state of the STP guard ('disabled', 'root guard', 'bpdu guard' or 'loop guard')
    //   linkNegotiation: String. The link speed for the switch profile port
    //   portScheduleId: String. The ID of the port schedule. A value of null will clear the port schedule.
    //   udld: String. The action to take when Unidirectional Link is detected (Alert only, Enforce). Default configuration is Alert only.
    //   accessPolicyType: String. The type of the access policy of the switch profile port. Only applicable to access ports. Can be one of 'Open', 'Custom access policy', 'MAC allow list' or 'Sticky MAC allow list'
    //   accessPolicyNumber: Integer. The number of a custom access policy to configure on the switch profile port. Only applicable when 'accessPolicyType' is 'Custom access policy'
    //   macAllowList: Array. Only devices with MAC addresses specified in this list will have access to this port. Up to 20 MAC addresses can be defined. Only applicable when 'accessPolicyType' is 'MAC allow list'
    //   stickyMacAllowList: Array. The initial list of MAC addresses for sticky Mac allow list. Only applicable when 'accessPolicyType' is 'Sticky MAC allow list'
    //   stickyMacAllowListLimit: Integer. The maximum number of MAC addresses for sticky MAC allow list. Only applicable when 'accessPolicyType' is 'Sticky MAC allow list'
    //   stormControlEnabled: Boolean. The storm control status of the switch profile port
    //   flexibleStackingEnabled: Boolean. For supported switches (e.g. MS420/MS425), whether or not the port has flexible stacking enabled.

    updateOrganizationConfigTemplateSwitchProfilePort (self, organizationId, configTemplateId, profileId, portId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/configTemplates/" + configTemplateId + "/switch/profiles/" + profileId + "/ports/" + portId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationConfigurationChanges: View the Change Log for your organization
    // GET /organizations/{organizationId}/configurationChanges

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-configuration-changes

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 365 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 365 days. The default is 365 days.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 5000. Default is 5000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   networkId: String. Filters on the given network
    //   adminId: String. Filters on the given Admin

    getOrganizationConfigurationChanges (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/configurationChanges", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationDevices: List the devices in an organization
    // GET /organizations/{organizationId}/devices

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-devices

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   configurationUpdatedAfter: String. Filter results by whether or not the device's configuration has been updated after the given timestamp

    getOrganizationDevices (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/devices", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationDevicesStatuses: List the status of every Meraki device in the organization
    // GET /organizations/{organizationId}/devices/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-devices-statuses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   components: Object. components

    getOrganizationDevicesStatuses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/devices/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationDevicesUplinksLossAndLatency: Return the uplink loss and latency for every MX in the organization from at latest 2 minutes ago
    // GET /organizations/{organizationId}/devices/uplinksLossAndLatency

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-devices-uplinks-loss-and-latency

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 365 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 5 minutes after t0. The latest possible time that t1 can be is 2 minutes into the past.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 5 minutes. The default is 5 minutes.
    //   uplink: String. Optional filter for a specific WAN uplink. Valid uplinks are wan1, wan2, cellular. Default will return all uplinks.
    //   ip: String. Optional filter for a specific destination IP. Default will return all destination IPs.

    getOrganizationDevicesUplinksLossAndLatency (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/devices/uplinksLossAndLatency", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationInsightApplications: List all Insight tracked applications
    // GET /organizations/{organizationId}/insight/applications

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-insight-applications

    getOrganizationInsightApplications (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/insight/applications")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationInsightMonitoredMediaServers: List the monitored media servers for this organization. Only valid for organizations with Meraki Insight.
    // GET /organizations/{organizationId}/insight/monitoredMediaServers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-insight-monitored-media-servers

    getOrganizationInsightMonitoredMediaServers (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/insight/monitoredMediaServers")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationInsightMonitoredMediaServer: Add a media server to be monitored for this organization. Only valid for organizations with Meraki Insight.
    // POST /organizations/{organizationId}/insight/monitoredMediaServers

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-insight-monitored-media-server

    // Request body schema:
    //   name: String. The name of the VoIP provider
    //   address: String. The IP address (IPv4 only) or hostname of the media server to monitor
    //   bestEffortMonitoringEnabled: Boolean. Indicates that if the media server doesn't respond to ICMP pings, the nearest hop will be used in its stead.

    createOrganizationInsightMonitoredMediaServer (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/insight/monitoredMediaServers", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationInsightMonitoredMediaServer: Return a monitored media server for this organization. Only valid for organizations with Meraki Insight.
    // GET /organizations/{organizationId}/insight/monitoredMediaServers/{monitoredMediaServerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-insight-monitored-media-server

    getOrganizationInsightMonitoredMediaServer (self, organizationId, monitoredMediaServerId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/insight/monitoredMediaServers/" + monitoredMediaServerId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationInsightMonitoredMediaServer: Update a monitored media server for this organization. Only valid for organizations with Meraki Insight.
    // PUT /organizations/{organizationId}/insight/monitoredMediaServers/{monitoredMediaServerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-insight-monitored-media-server

    // Request body schema:
    //   name: String. The name of the VoIP provider
    //   address: String. The IP address (IPv4 only) or hostname of the media server to monitor
    //   bestEffortMonitoringEnabled: Boolean. Indicates that if the media server doesn't respond to ICMP pings, the nearest hop will be used in its stead.

    updateOrganizationInsightMonitoredMediaServer (self, organizationId, monitoredMediaServerId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/insight/monitoredMediaServers/" + monitoredMediaServerId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationInsightMonitoredMediaServer: Delete a monitored media server from this organization. Only valid for organizations with Meraki Insight.
    // DELETE /organizations/{organizationId}/insight/monitoredMediaServers/{monitoredMediaServerId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-insight-monitored-media-server

    deleteOrganizationInsightMonitoredMediaServer (self, organizationId, monitoredMediaServerId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/insight/monitoredMediaServers/" + monitoredMediaServerId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationInventoryDevices: Return the device inventory for an organization
    // GET /organizations/{organizationId}/inventoryDevices

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-inventory-devices

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   usedState: String. Filter results by used or unused inventory. Accepted values are "used" or "unused".
    //   search: String. Search for devices in inventory based on serial number, mac address, or model.

    getOrganizationInventoryDevices (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/inventoryDevices", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationInventoryDevice: Return a single device from the inventory of an organization
    // GET /organizations/{organizationId}/inventoryDevices/{serial}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-inventory-device

    getOrganizationInventoryDevice (self, organizationId, serial) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/inventoryDevices/" + serial)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationLicenses: List the licenses for an organization
    // GET /organizations/{organizationId}/licenses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-licenses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   deviceSerial: String. Filter the licenses to those assigned to a particular device
    //   networkId: String. Filter the licenses to those assigned in a particular network
    //   state: String. Filter the licenses to those in a particular state. Can be one of 'active', 'expired', 'expiring', 'unused', 'unusedActive' or 'recentlyQueued'

    getOrganizationLicenses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/licenses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // assignOrganizationLicensesSeats: Assign SM seats to a network. This will increase the managed SM device limit of the network
    // POST /organizations/{organizationId}/licenses/assignSeats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!assign-organization-licenses-seats

    // Request body schema:
    //   licenseId: String. The ID of the SM license to assign seats from
    //   networkId: String. The ID of the SM network to assign the seats to
    //   seatCount: Integer. The number of seats to assign to the SM network. Must be less than or equal to the total number of seats of the license

    assignOrganizationLicensesSeats (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/licenses/assignSeats", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // moveOrganizationLicenses: Move licenses to another organization. This will also move any devices that the licenses are assigned to
    // POST /organizations/{organizationId}/licenses/move

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!move-organization-licenses

    // Request body schema:
    //   destOrganizationId: String. The ID of the organization to move the licenses to
    //   licenseIds: Array. A list of IDs of licenses to move to the new organization

    moveOrganizationLicenses (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/licenses/move", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // moveOrganizationLicensesSeats: Move SM seats to another organization
    // POST /organizations/{organizationId}/licenses/moveSeats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!move-organization-licenses-seats

    // Request body schema:
    //   destOrganizationId: String. The ID of the organization to move the SM seats to
    //   licenseId: String. The ID of the SM license to move the seats from
    //   seatCount: Integer. The number of seats to move to the new organization. Must be less than or equal to the total number of seats of the license

    moveOrganizationLicensesSeats (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/licenses/moveSeats", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationLicensesOverview: Return an overview of the license state for an organization
    // GET /organizations/{organizationId}/licenses/overview

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-licenses-overview

    getOrganizationLicensesOverview (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/licenses/overview")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // renewOrganizationLicensesSeats: Renew SM seats of a license. This will extend the license expiration date of managed SM devices covered by this license
    // POST /organizations/{organizationId}/licenses/renewSeats

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!renew-organization-licenses-seats

    // Request body schema:
    //   licenseIdToRenew: String. The ID of the SM license to renew. This license must already be assigned to an SM network
    //   unusedLicenseId: String. The SM license to use to renew the seats on 'licenseIdToRenew'. This license must have at least as many seats available as there are seats on 'licenseIdToRenew'

    renewOrganizationLicensesSeats (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/licenses/renewSeats", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationLicense: Display a license
    // GET /organizations/{organizationId}/licenses/{licenseId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-license

    getOrganizationLicense (self, organizationId, licenseId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/licenses/" + licenseId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationLicense: Update a license
    // PUT /organizations/{organizationId}/licenses/{licenseId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-license

    // Request body schema:
    //   deviceSerial: String. The serial number of the device to assign this license to. Set this to null to unassign the license. If a different license is already active on the device, this parameter will control queueing/dequeuing this license.

    updateOrganizationLicense (self, organizationId, licenseId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/licenses/" + licenseId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationLoginSecurity: Returns the login security settings for an organization.
    // GET /organizations/{organizationId}/loginSecurity

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-login-security

    getOrganizationLoginSecurity (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/loginSecurity")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationLoginSecurity: Update the login security settings for an organization
    // PUT /organizations/{organizationId}/loginSecurity

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-login-security

    // Request body schema:
    //   enforcePasswordExpiration: Boolean. Boolean indicating whether users are forced to change their password every X number of days.
    //   passwordExpirationDays: Integer. Number of days after which users will be forced to change their password.
    //   enforceDifferentPasswords: Boolean. Boolean indicating whether users, when setting a new password, are forced to choose a new password that is different from any past passwords.
    //   numDifferentPasswords: Integer. Number of recent passwords that new password must be distinct from.
    //   enforceStrongPasswords: Boolean. Boolean indicating whether users will be forced to choose strong passwords for their accounts. Strong passwords are at least 8 characters that contain 3 of the following: number, uppercase letter, lowercase letter, and symbol
    //   enforceAccountLockout: Boolean. Boolean indicating whether users' Dashboard accounts will be locked out after a specified number of consecutive failed login attempts.
    //   accountLockoutAttempts: Integer. Number of consecutive failed login attempts after which users' accounts will be locked.
    //   enforceIdleTimeout: Boolean. Boolean indicating whether users will be logged out after being idle for the specified number of minutes.
    //   idleTimeoutMinutes: Integer. Number of minutes users can remain idle before being logged out of their accounts.
    //   enforceTwoFactorAuth: Boolean. Boolean indicating whether users in this organization will be required to use an extra verification code when logging in to Dashboard. This code will be sent to their mobile phone via SMS, or can be generated by the Google Authenticator application.
    //   enforceLoginIpRanges: Boolean. Boolean indicating whether organization will restrict access to Dashboard (including the API) from certain IP addresses.
    //   loginIpRanges: Array. List of acceptable IP ranges. Entries can be single IP addresses, IP address ranges, and CIDR subnets.

    updateOrganizationLoginSecurity (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/loginSecurity", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationNetworks: List the networks that the user has privileges on in an organization
    // GET /organizations/{organizationId}/networks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-networks

    // Query parameters:
    //   configTemplateId: String. An optional parameter that is the ID of a config template. Will return all networks bound to that template.
    //   tags: Array. An optional parameter to filter networks by tags. The filtering is case-sensitive. If tags are included, 'tagsFilterType' should also be included (see below).
    //   tagsFilterType: String. An optional parameter of value 'withAnyTags' or 'withAllTags' to indicate whether to return networks which contain ANY or ALL of the included tags. If no type is included, 'withAnyTags' will be selected.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 100000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.

    getOrganizationNetworks (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/networks", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationNetwork: Create a network
    // POST /organizations/{organizationId}/networks

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-network

    // Request body schema:
    //   name: String. The name of the new network
    //   productTypes: Array. The product type(s) of the new network. Valid types are wireless, appliance, switch, systemsManager, camera, cellularGateway, sensor, environmental. If more than one type is included, the network will be a combined network.
    //   tags: Array. A list of tags to be applied to the network
    //   timeZone: String. The timezone of the network. For a list of allowed timezones, please see the 'TZ' column in the table in <a target='_blank' href='https://en.wikipedia.org/wiki/List_of_tz_database_time_zones'>this article.</a>
    //   copyFromNetworkId: String. The ID of the network to copy configuration from. Other provided parameters will override the copied configuration, except type which must match this network's type exactly.
    //   notes: String. Add any notes or additional information about this network here.

    createOrganizationNetwork (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/networks", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // combineOrganizationNetworks: Combine multiple networks into a single network
    // POST /organizations/{organizationId}/networks/combine

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!combine-organization-networks

    // Request body schema:
    //   name: String. The name of the combined network
    //   networkIds: Array. A list of the network IDs that will be combined. If an ID of a combined network is included in this list, the other networks in the list will be grouped into that network
    //   enrollmentString: String. A unique identifier which can be used for device enrollment or easy access through the Meraki SM Registration page or the Self Service Portal. Please note that changing this field may cause existing bookmarks to break. All networks that are part of this combined network will have their enrollment string appended by '-network_type'. If left empty, all exisitng enrollment strings will be deleted.

    combineOrganizationNetworks (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/networks/combine", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationOpenapiSpec: Return the OpenAPI 2.0 Specification of the organization's API documentation in JSON
    // GET /organizations/{organizationId}/openapiSpec

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-openapi-spec

    getOrganizationOpenapiSpec (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/openapiSpec")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSaml: Returns the SAML SSO enabled settings for an organization.
    // GET /organizations/{organizationId}/saml

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-saml

    getOrganizationSaml (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/saml")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationSaml: Updates the SAML SSO enabled settings for an organization.
    // PUT /organizations/{organizationId}/saml

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-saml

    // Request body schema:
    //   enabled: Boolean. Boolean for updating SAML SSO enabled settings.

    updateOrganizationSaml (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/saml", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSamlIdps: List the SAML IdPs in your organization.
    // GET /organizations/{organizationId}/saml/idps

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-saml-idps

    getOrganizationSamlIdps (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/saml/idps")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationSamlIdp: Create a SAML IdP for your organization.
    // POST /organizations/{organizationId}/saml/idps

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-saml-idp

    // Request body schema:
    //   x509certSha1Fingerprint: String. Fingerprint (SHA1) of the SAML certificate provided by your Identity Provider (IdP). This will be used for encryption / validation.
    //   sloLogoutUrl: String. Dashboard will redirect users to this URL when they sign out.

    createOrganizationSamlIdp (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/saml/idps", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationSamlIdp: Update a SAML IdP in your organization
    // PUT /organizations/{organizationId}/saml/idps/{idpId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-saml-idp

    // Request body schema:
    //   x509certSha1Fingerprint: String. Fingerprint (SHA1) of the SAML certificate provided by your Identity Provider (IdP). This will be used for encryption / validation.
    //   sloLogoutUrl: String. Dashboard will redirect users to this URL when they sign out.

    updateOrganizationSamlIdp (self, organizationId, idpId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/saml/idps/" + idpId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSamlIdp: Get a SAML IdP from your organization.
    // GET /organizations/{organizationId}/saml/idps/{idpId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-saml-idp

    getOrganizationSamlIdp (self, organizationId, idpId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/saml/idps/" + idpId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationSamlIdp: Remove a SAML IdP in your organization.
    // DELETE /organizations/{organizationId}/saml/idps/{idpId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-saml-idp

    deleteOrganizationSamlIdp (self, organizationId, idpId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/saml/idps/" + idpId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSamlRoles: List the SAML roles for this organization
    // GET /organizations/{organizationId}/samlRoles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-saml-roles

    getOrganizationSamlRoles (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/samlRoles")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // createOrganizationSamlRole: Create a SAML role
    // POST /organizations/{organizationId}/samlRoles

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!create-organization-saml-role

    // Request body schema:
    //   role: String. The role of the SAML administrator
    //   orgAccess: String. The privilege of the SAML administrator on the organization. Can be one of 'none', 'read-only' or 'full'
    //   tags: Array. The list of tags that the SAML administrator has privleges on
    //   networks: Array. The list of networks that the SAML administrator has privileges on

    createOrganizationSamlRole (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/samlRoles", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSamlRole: Return a SAML role
    // GET /organizations/{organizationId}/samlRoles/{samlRoleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-saml-role

    getOrganizationSamlRole (self, organizationId, samlRoleId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/samlRoles/" + samlRoleId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationSamlRole: Update a SAML role
    // PUT /organizations/{organizationId}/samlRoles/{samlRoleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-saml-role

    // Request body schema:
    //   role: String. The role of the SAML administrator
    //   orgAccess: String. The privilege of the SAML administrator on the organization. Can be one of 'none', 'read-only' or 'full'
    //   tags: Array. The list of tags that the SAML administrator has privleges on
    //   networks: Array. The list of networks that the SAML administrator has privileges on

    updateOrganizationSamlRole (self, organizationId, samlRoleId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/samlRoles/" + samlRoleId, { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // deleteOrganizationSamlRole: Remove a SAML role
    // DELETE /organizations/{organizationId}/samlRoles/{samlRoleId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!delete-organization-saml-role

    deleteOrganizationSamlRole (self, organizationId, samlRoleId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "delete", "/organizations/" + organizationId + "/samlRoles/" + samlRoleId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSmApnsCert: Get the organization's APNS certificate
    // GET /organizations/{organizationId}/sm/apnsCert

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-sm-apns-cert

    getOrganizationSmApnsCert (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/sm/apnsCert")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSmVppAccounts: List the VPP accounts in the organization
    // GET /organizations/{organizationId}/sm/vppAccounts

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-sm-vpp-accounts

    getOrganizationSmVppAccounts (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/sm/vppAccounts")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSmVppAccount: Get a hash containing the unparsed token of the VPP account with the given ID
    // GET /organizations/{organizationId}/sm/vppAccounts/{vppAccountId}

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-sm-vpp-account

    getOrganizationSmVppAccount (self, organizationId, vppAccountId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/sm/vppAccounts/" + vppAccountId)
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationSnmp: Return the SNMP settings for an organization
    // GET /organizations/{organizationId}/snmp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-snmp

    getOrganizationSnmp (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/snmp")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // updateOrganizationSnmp: Update the SNMP settings for an organization
    // PUT /organizations/{organizationId}/snmp

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!update-organization-snmp

    // Request body schema:
    //   v2cEnabled: Boolean. Boolean indicating whether SNMP version 2c is enabled for the organization.
    //   v3Enabled: Boolean. Boolean indicating whether SNMP version 3 is enabled for the organization.
    //   v3AuthMode: String. The SNMP version 3 authentication mode. Can be either 'MD5' or 'SHA'.
    //   v3AuthPass: String. The SNMP version 3 authentication password. Must be at least 8 characters if specified.
    //   v3PrivMode: String. The SNMP version 3 privacy mode. Can be either 'DES' or 'AES128'.
    //   v3PrivPass: String. The SNMP version 3 privacy password. Must be at least 8 characters if specified.
    //   peerIps: Array. The list of IPv4 addresses that are allowed to access the SNMP server.

    updateOrganizationSnmp (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "put", "/organizations/" + organizationId + "/snmp", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // cloneOrganizationSwitchDevices: Clone port-level and some switch-level configuration settings from a source switch to one or more target switches. Cloned settings include: Aggregation Groups, Power Settings, Multicast Settings, MTU Configuration, STP Bridge priority, Port Mirroring
    // POST /organizations/{organizationId}/switch/devices/clone

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!clone-organization-switch-devices

    // Request body schema:
    //   sourceSerial: String. Serial number of the source switch (must be on a network not bound to a template)
    //   targetSerials: Array. Array of serial numbers of one or more target switches (must be on a network not bound to a template)

    cloneOrganizationSwitchDevices (self, organizationId, body) {
        return new Promise(function (resolve, reject) {
            self.request(self, "post", "/organizations/" + organizationId + "/switch/devices/clone", { data: body })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationUplinksStatuses: List the uplink status of every Meraki MX, MG and Z series devices in the organization
    // GET /organizations/{organizationId}/uplinks/statuses

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-uplinks-statuses

    // Query parameters:
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 1000.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   networkIds: Array. A list of network IDs. The returned devices will be filtered to only include these networks.
    //   serials: Array. A list of serial numbers. The returned devices will be filtered to only include these serials.
    //   iccids: Array. A list of ICCIDs. The returned devices will be filtered to only include these ICCIDs.

    getOrganizationUplinksStatuses (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/uplinks/statuses", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationWebhooksAlertTypes: Return a list of alert types to be used with managing webhook alerts
    // GET /organizations/{organizationId}/webhooks/alertTypes

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-webhooks-alert-types

    getOrganizationWebhooksAlertTypes (self, organizationId) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/webhooks/alertTypes")
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    

    // getOrganizationWebhooksLogs: Return the log of webhook POSTs sent
    // GET /organizations/{organizationId}/webhooks/logs

    // Endpoint documentation: https://developer.cisco.com/meraki/api-v1/#!get-organization-webhooks-logs

    // Query parameters:
    //   t0: String. The beginning of the timespan for the data. The maximum lookback period is 90 days from today.
    //   t1: String. The end of the timespan for the data. t1 can be a maximum of 31 days after t0.
    //   timespan: Number. The timespan for which the information will be fetched. If specifying timespan, do not specify parameters t0 and t1. The value must be in seconds and be less than or equal to 31 days. The default is 1 day.
    //   perPage: Integer. The number of entries per page returned. Acceptable range is 3 - 1000. Default is 50.
    //   startingAfter: String. A token used by the server to indicate the start of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   endingBefore: String. A token used by the server to indicate the end of the page. Often this is a timestamp or an ID but it is not limited to those. This parameter should not be defined by client applications. The link for the first, last, prev, or next page in the HTTP Link header should define it.
    //   url: String. The URL the webhook was sent to

    getOrganizationWebhooksLogs (self, organizationId, query) {
        return new Promise(function (resolve, reject) {
            self.request(self, "get", "/organizations/" + organizationId + "/webhooks/logs", { query: query })
                .then(function(response) {
                    resolve(response);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }
    
    
} // class MerakiClass

var Meraki = new MerakiClass();

module.exports = Meraki;
module.exports.MerakiClass = MerakiClass;