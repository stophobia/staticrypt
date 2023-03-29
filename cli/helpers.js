const path = require("path");
const fs = require("fs");
const readline = require('readline');

const { generateRandomSalt } = require("../lib/cryptoEngine.js");
const {renderTemplate} = require("../lib/formater.js");
const Yargs = require("yargs");

const PASSWORD_TEMPLATE_DEFAULT_PATH = path.join(__dirname, "..", "lib", "password_template.html");


/**
 * @param {string} message
 */
function exitWithError(message) {
    console.log("ERROR: " + message);
    process.exit(1);
}
exports.exitWithError = exitWithError;

/**
 * Check if a particular option has been set by the user. Useful for distinguishing default value with flag without
 * parameter.
 *
 * Ex use case: '-s' means "give me a salt", '-s 1234' means "use 1234 as salt"
 *
 * From https://github.com/yargs/yargs/issues/513#issuecomment-221412008
 *
 * @param {string} option
 * @param yargs
 * @returns {boolean}
 */
function isOptionSetByUser(option, yargs) {
    function searchForOption(option) {
        return process.argv.indexOf(option) > -1;
    }

    if (searchForOption(`-${option}`) || searchForOption(`--${option}`)) {
        return true;
    }

    // Handle aliases for same option
    for (let aliasIndex in yargs.parsed.aliases[option]) {
        const alias = yargs.parsed.aliases[option][aliasIndex];

        if (searchForOption(`-${alias}`) || searchForOption(`--${alias}`))
            return true;
    }

    return false;
}
exports.isOptionSetByUser = isOptionSetByUser;

/**
 * Prompts the user for input on the CLI.
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
function prompt (question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        return rl.question(question, (answer) => {
            rl.close();
            return resolve(answer);
        });
    });
}

/**
 * Get the password from the command arguments or environment variables.
 *
 * @param {string} passwordArgument - password from the command line
 * @returns {Promise<string>}
 */
async function getPassword(passwordArgument) {
    // try to get the password from the environment variable
    const envPassword = process.env.STATICRYPT_PASSWORD;
    const hasEnvPassword = envPassword !== undefined && envPassword !== "";
    if (hasEnvPassword) {
        return envPassword;
    }

    // try to get the password from the command line arguments
    if (passwordArgument !== null) {
        return passwordArgument;
    }

    // prompt the user for their password
    return prompt('Enter your long, unusual password: ');
}
exports.getPassword = getPassword;

/**
 * @param {string} filepath
 * @returns {string}
 */
function getFileContent(filepath) {
    try {
        return fs.readFileSync(filepath, "utf8");
    } catch (e) {
        exitWithError("input file does not exist!");
    }
}
exports.getFileContent = getFileContent;

/**
 * @param {object} namedArgs
 * @param {object} config
 * @returns {string}
 */
function getSalt(namedArgs, config) {
    // either a salt was provided by the user through the flag --salt
    if (!!namedArgs.salt) {
        return String(namedArgs.salt).toLowerCase();
    }

    // or try to read the salt from config file
    if (config.salt) {
        return config.salt;
    }

    return generateRandomSalt();
}
exports.getSalt = getSalt;

/**
 * A dead-simple alternative to webpack or rollup for inlining simple
 * CommonJS modules in a browser <script>.
 * - Removes all lines containing require().
 * - Wraps the module in an immediately invoked function that returns `exports`.
 *
 * @param {string} modulePath - path from staticrypt root directory
 */
function convertCommonJSToBrowserJS(modulePath) {
    const rootDirectory = path.join(__dirname, '..');
    const resolvedPath = path.join(rootDirectory, ...modulePath.split("/")) + ".js";

    if (!fs.existsSync(resolvedPath)) {
        exitWithError(`could not find module to convert at path "${resolvedPath}"`);
    }

    const moduleText = fs
        .readFileSync(resolvedPath, "utf8")
        .replace(/^.*\brequire\(.*$\n/gm, "");

    return `
((function(){
  const exports = {};
  ${moduleText}
  return exports;
})())
  `.trim();
}
exports.convertCommonJSToBrowserJS = convertCommonJSToBrowserJS;

/**
 * @param {string} filePath
 * @param {string} errorName
 * @returns {string}
 */
function readFile(filePath, errorName = "file") {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        console.error(e);
        exitWithError(`could not read ${errorName} at path "${filePath}"`);
    }
}

/**
 * Fill the template with provided data and writes it to output file.
 *
 * @param {Object} data
 * @param {string} outputFilePath
 * @param {string} templateFilePath
 */
function genFile(data, outputFilePath, templateFilePath) {
    const templateContents = readFile(templateFilePath, "template");

    const renderedTemplate = renderTemplate(templateContents, data);

    // create output directory if it does not exist
    const dirname = path.dirname(outputFilePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }

    try {
        fs.writeFileSync(outputFilePath, renderedTemplate);
    } catch (e) {
        console.error(e);
        exitWithError("could not generate output file");
    }
}
exports.genFile = genFile;

/**
 * @param {string} templatePathParameter
 * @returns {boolean}
 */
function isCustomPasswordTemplateDefault(templatePathParameter) {
    // if the user uses the default template, it's up to date
    return templatePathParameter === PASSWORD_TEMPLATE_DEFAULT_PATH;
}
exports.isCustomPasswordTemplateDefault = isCustomPasswordTemplateDefault;

function parseCommandLineArguments() {
    return Yargs.usage("Usage: staticrypt <filename> [options]")
        .option("c", {
            alias: "config",
            type: "string",
            describe: 'Path to the config file. Set to "false" to disable.',
            default: ".staticrypt.json",
        })
        .option("o", {
            alias: "output",
            type: "string",
            describe: "Name of the directory where the encrypted files will be saved.",
            default: "encrypted/",
        })
        .option("p", {
            alias: "password",
            type: "string",
            describe: "The password to encrypt your file with.",
            default: null,
        })
        .option("remember", {
            type: "number",
            describe:
                'Expiration in days of the "Remember me" checkbox that will save the (salted + hashed) password ' +
                'in localStorage when entered by the user. Set to "false" to hide the box. Default: "0", no expiration.',
            default: 0,
        })
        // do not give a default option to this parameter - we want to see when the flag is included with no
        // value and when it's not included at all
        .option("s", {
            alias: "salt",
            describe:
                'Set the salt manually. It should be set if you want to use "Remember me" through multiple pages. It ' +
                "needs to be a 32-character-long hexadecimal string.\nInclude the empty flag to generate a random salt you " +
                'can use: "statycrypt -s".',
            type: "string",
        })
        // do not give a default option to this parameter - we want to see when the flag is included with no
        // value and when it's not included at all
        .option("share", {
            describe:
                'Get a link containing your hashed password that will auto-decrypt the page. Pass your URL as a value to append '
                + '"#staticrypt_pwd=<hashed_pwd>", or leave empty to display the hash to append.',
            type: "string",
        })
        .option("short", {
            describe: 'Hide the "short password" warning.',
            type: "boolean",
            default: false,
        })
        .option("t", {
            alias: "template",
            type: "string",
            describe: "Path to custom HTML template with password prompt.",
            default: PASSWORD_TEMPLATE_DEFAULT_PATH,
        })
        .option("template-button", {
            type: "string",
            describe: 'Label to use for the decrypt button. Default: "DECRYPT".',
            default: "DECRYPT",
        })
        .option("template-instructions", {
            type: "string",
            describe: "Special instructions to display to the user.",
            default: "",
        })
        .option("template-error", {
            type: "string",
            describe: "Error message to display on entering wrong password.",
            default: "Bad password!",
        })
        .option("template-placeholder", {
            type: "string",
            describe: "Placeholder to use for the password input.",
            default: "Password",
        })
        .option("template-remember", {
            type: "string",
            describe: 'Label to use for the "Remember me" checkbox.',
            default: "Remember me",
        })
        .option("template-title", {
            type: "string",
            describe: "Title for the output HTML page.",
            default: "Protected Page",
        });
}
exports.parseCommandLineArguments = parseCommandLineArguments;
