// Common GAS Functions
// v2.5.0 - 2025-04-26

var common = {

    /**
     * Get a reference to the given folder, or create one if it doesn't exist
     * 
     * @param {string} parentDir - ID of the parent directory
     * @param {string} foldername - Name of the folder to find or create
     * @returns {Folder}
     */
    findOrCreateFolder: function(parentDir, foldername)
    {
        // See if there's already a folder in the indicated Google Drive folder
        var backupFolder = DriveApp.getFolderById(parentDir);
        var folders = backupFolder.getFoldersByName(foldername);

        if (folders.hasNext())
        {
            return folders.next();
        }
        else
        {
            // Create a new folder
            Logger.log(`Created new folder: ${foldername}`);
            return backupFolder.createFolder(foldername);
        }
    },

    /**
     * Delete a file from a folder, if it exists
     * 
     * @param {string} parentDir - ID of the folder
     * @param {string} filename - Name of the file to delete
     */
    deleteFile: function(parentDir, filename)
    {
        // See if the indicated file is in the indicated Google Drive folder
        var folder = DriveApp.getFolderById(parentDir);
        var files = folder.getFilesByName(filename);
        if (files.hasNext())
        {
            files.next().setTrashed(true);
            Logger.log(`Deleted file: ${filename}`);
        }
    },

    /**
     * Find or create a file in a given folder
     * 
     * @param {string} parentDir - ID of the folder
     * @param {string} filename - Name of the file
     * @param {string} [content=""] - Content for the new file if it's created
     * @returns {File}
     */
    findOrCreateFile: function(parentDir, filename, content = "")
    {
        // See if there's already a file in the indicated Google Drive folder
        var folder = DriveApp.getFolderById(parentDir);
        var files = folder.getFilesByName(filename);
        if (files.hasNext())
        {
            return files.next();
        }
        else
        {
            // Create a new empty file
            Logger.log(`Created file: ${filename}`);
            return folder.createFile(filename, content);
        }
    },

    /**
     * Write to file, only if different to existing content
     * 
     * @param {string} parentDir - ID of the folder
     * @param {string} filename - Name of the file
     * @param {string} content - Content to write to file
     * @returns {File}
     */
    updateOrCreateFile: function(parentDir, filename, content)
    {
        var file = common.findOrCreateFile(parentDir, filename);

        // Check if the contents already matches
        if (file.getBlob().getDataAsString() != content)
        {
            // Set the file contents
            file.setContent(content);
            Logger.log(`Updated file: ${filename}`);
        }
        return file;
    },

    /**
     * Append content to a file
     * 
     * @param {string} parentDir - ID of the folder
     * @param {string} filename - Name of the file
     * @param {string} content - Content to append to file
     * @returns {File}
     */
    appendOrCreateFile: function(parentDir, filename, newContent)
    {
        var file = common.findOrCreateFile(parentDir, filename);

        // Retrieve existing file content
        var content = file.getBlob().getDataAsString();
        content += newContent;

        // Set the file contents
        file.setContent(content);
        Logger.log(`Updated file: ${filename}`);

        return file;
    },

    /**
     * Write a blob file
     * 
     * @param {string} parentDir - ID of the folder
     * @param {string} filename - Name of the file
     * @param {string} content - Content to write to file
     * @returns {File}
     */
    updateOrCreateBlobFile: function(parentDir, filename, content)
    {
        // Start off by deleting any old file with the same name
        common.deleteFile(parentDir, filename);

        // Create a new file, with the new contents
        var folder = DriveApp.getFolderById(parentDir);
        var newFile = folder.createFile(content);
        newFile.setName(filename);
        Logger.log(`Updated file: ${filename}`);
        return newFile;
    },

    /**
     * Write JSON object to file as string
     * 
     * @param {string} parentDir - ID of the folder
     * @param {string} filename - Name of the file
     * @param {string} content - Content to write to file
     * @returns {File}
     */
    updateOrCreateJsonFile: function(parentDir, filename, content)
    {
        let prettyContent = this.prettyPrintJson(content);
        return this.updateOrCreateFile(parentDir, filename, prettyContent);
    },

    /**
     * Retrieve given file content as JSON object
     * 
     * @param {File} file - The file to parse
     * @returns {Object}
     */
    getJsonFileContent: function(file)
    {
        file = file.getAs("application/json");
        return JSON.parse(file.getDataAsString());
    },

    /**
     * Convert a JSON object or string into a formatted string
     * 
     * @param {Object|string} input - A raw JSON string or object
     * @returns {string}
     */
    prettyPrintJson: function(input)
    {
        if (typeof input === "string")
        {
            input = JSON.parse(input);
        }
        return JSON.stringify(input, null, 4);
    },

    /**
     * Parse a query string from a request object to extract a path parameter.
     *
     * @param {GoogleAppsScript.Events.DoGet} request - The request object.
     * @returns {string}
     */
    parsePathParameters: function(request)
    {
        // If there's only one parameter, just treat it as a path
        if (!request.queryString.match(/\=/))
        {
            return request.queryString;
        }

        // Look for a parameter called "path"
        return request.parameter.path || "";
    },

    /**
     * Strip spaces, no-break spaces, zero-width spaces,
     * & zero-width no-break spaces
     * 
     * @param {string} string - The string to trim.
     * @returns {string}
     */
    trim: function(string)
    {
        var pattern = /(^[\s\u00a0\u200b\uFEFF]+)|([\s\u00a0\u200b\uFEFF]+$)/g;
        return string.replace(pattern, "");
    },

    /**
     * Collate values from nested path, across array of JSON strings
     * 
     * @param {string} path - Dot-separated path to the desired property
     * @param {string[]} objects - Array of JSON strings
     * @param {boolean} [ignoreNulls=false] - Whether to filter out nulls
     * @returns {Array} - Flattened array of collected values
     */
    collateArrays: function(path, objects, ignoreNulls = false)
    {
        var outArray = [];
        var chunks = path.split('.');

        // Iterate over each object
        for (const resp of objects)
        {
            var obj = JSON.parse(resp);
            for (const chunk of chunks)
            {
                obj = obj[chunk];
            }

            if (ignoreNulls)
            {
                obj = obj.filter((value) => value != null);
            }
            outArray = outArray.concat(obj);
        }

        return outArray;
    },

    /**
     * Collate unique values from nested path, across array of objects
     * 
     * @param {string} path - Dot-separated path to the desired property
     * @param {Object[]} objects - Array of objects
     * @param {boolean} [ignoreNulls=false] - Whether to filter out nulls
     * @returns {Array} - Array of unique values found at that path
     */
    collateValues: function(path, objects, ignoreNulls = false)
    {
        var outArray = new Set();
        var chunks = path.split('.');

        // Iterate over each object
        for (var obj of objects)
        {
            for (const chunk of chunks)
            {
                obj = obj[chunk];
            }

            if (ignoreNulls)
            {
                obj = obj.filter((value) => value != null);
            }
            outArray.add(obj);
        }

        return [...outArray];
    },

    /**
     * Convert array into a map for counting occurrences
     * 
     * @param {Array} array - Array of keys
     * @param {number} [defaultCount=0] - Initial count to assign to each key
     * @returns {Map} - A map of keys with default counts
     */
    arrayToCountMap: function(array, defaultCount = 0)
    {
        var output = new Map();
        array.forEach(element =>
        {
            output.set(element, defaultCount);
        });
        return output;
    },

    /**
     * Convert UNIX timestamp to an ISO 8601 formatted date string
     * 
     * @param {number} seconds - Time since epoch (in seconds)
     * @returns {string} - ISO 8601 formatted date string
     */
    epochToIso: function(seconds)
    {
        var date = new Date(0);
        date.setUTCSeconds(seconds);
        return date.toISOString();
    },
};
