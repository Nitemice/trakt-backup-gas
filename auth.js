// Authentication URLs
const baseAuthUrl = "https://api.trakt.tv/";
const authUrl = baseAuthUrl + "/oauth/device/code";
const pollUrl = baseAuthUrl + "/oauth/device/token";
const refreshUrl = baseAuthUrl + "/oauth/token";

function getFreshAuth()
{
    // Retrieve refreshable auth info from scratch
    // Using interactive "device" auth

    // Initial Request - get code for user to enter
    var options = {
        'method': 'post',
        'Content-Type': 'application/json',
        'payload': {
            "client_id": config.clientId,
        }
    };
    var response = UrlFetchApp.fetch(authUrl, options);

    // Retrieve values from response
    var initResp = JSON.parse(response.getContentText());
    const deviceCode = initResp.device_code;
    const expiry = initResp.expires_in;
    const interval = initResp.interval;

    // Show the user where to go & what to enter
    Logger.log("Go to %s and enter: %s", initResp.verification_url,
        initResp.user_code);

    // Poll Request - check if the app is authorised yet
    var queryTime = 0;
    while (queryTime < expiry)
    {
        var payload = {
            "code": deviceCode,
            "client_id": config.clientId,
            "client_secret": config.clientSecret,
        };

        options = {
            'method': 'post',
            'Content-Type': 'application/json',
            'payload': payload,
            'muteHttpExceptions': true
        };

        response = UrlFetchApp.fetch(pollUrl, options);
        // Logger.log(response);

        // If the response was a success, we're authorised
        if (response.getResponseCode() == 200)
        {
            // Grab the values we're looking for and return them
            var newTokens = JSON.parse(response.getContentText());
            var authInfo = new Object();

            authInfo.accessToken = newTokens.access_token;
            authInfo.refreshToken = newTokens.refresh_token;
            authInfo.expiry = newTokens.created_at + newTokens.expires_in;
            return authInfo;
        }
        // If the response is anything other than 'pending', something's wrong
        else if (response.getResponseCode() != 400)
        {
            throw "Something went wrong polling for authorisation.";
        }

        // Let them know we're still waiting
        Logger.log("Polling countdown: %s / %s ...", queryTime.toString(),
            expiry.toString());

        // Sleep until we can make another request
        Utilities.sleep(interval * 1000);
        queryTime += interval;
    }

    // Polling time expired without success
    // Can't do much without authentication
    throw "Polling expired without authorisation.";
}

function refreshAuth(refreshToken)
{
    // Refresh auth info with refresh token

    // Request refreshed tokens
    var payload = {
        "refresh_token": refreshToken,
        "client_id": config.clientId,
        "client_secret": config.clientSecret,
        "redirect_uri": "urn:ietf:wg:oauth:2.0:oob",
        "grant_type": "refresh_token"
    };

    var options = {
        'method': 'post',
        'Content-Type': 'application/json',
        'payload': payload
    };

    var response = UrlFetchApp.fetch(refreshUrl, options);

    // Grab the values we're looking for and return them
    var newTokens = JSON.parse(response.getContentText());
    var authInfo = new Object();

    authInfo.accessToken = newTokens.access_token;
    authInfo.refreshToken = newTokens.refresh_token;
    authInfo.expiry = newTokens.created_at + newTokens.expires_in;
    return authInfo;
}

function retrieveAuth()
{
    // Retrieve refreshable auth info from user properties store
    var userProperties = PropertiesService.getUserProperties();
    var authInfo = userProperties.getProperties();

    // Check if auth info is there
    if (!authInfo.hasOwnProperty("refreshToken") ||
        !authInfo.hasOwnProperty("accessToken"))
    {
        // Fall back to getting fresh auth
        Logger.log("No access/refresh token. Running first-run authentication.");
        authInfo = getFreshAuth(config);

        // Save the new auth info back to the user properties store
        userProperties.setProperties(authInfo);
    }

    // Check if the auth token has expired yet
    var now = Date.now() / 1000;
    if (now > authInfo.expiry)
    {
        // Refresh the auth info
        Logger.log("Access token expired. Refreshing authentication...");
        authInfo = refreshAuth(authInfo.refreshToken);

        // Save the new auth info back to the user properties store
        userProperties.setProperties(authInfo);
    }

    // Return an object with the details we need for retrieving data
    authInfo.clientId = config.clientId;
    return authInfo;
}

function resetAuth()
{
    // Wipe refreshable auth info from user properties store
    var userProperties = PropertiesService.getUserProperties();
    userProperties.deleteProperty("refreshToken").deleteProperty("accessToken");

    // Get fresh auth
    Logger.log("Access/refresh token deleted. Running first-run authentication again.");
    var authInfo = getFreshAuth(config);

    // Save the new auth info back to the user properties store
    userProperties.setProperties(authInfo);
}
