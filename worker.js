"use strict";


const APP_ID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5";


const KID =
    "vpaas-magic-cookie-dbe56e5f85cc48a280fb38e749f470d5/17586a";


/* ============================================================
   CORS
============================================================ */

function corsHeaders() {

    return {

        "Access-Control-Allow-Origin":
            "*",

        "Access-Control-Allow-Methods":
            "POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type",

        "Content-Type":
            "application/json"

    };

}


/* ============================================================
   RESPONSE
============================================================ */

function json(
    data,
    status = 200
) {

    return new Response(
        JSON.stringify(data),
        {
            status: status,
            headers: corsHeaders()
        }
    );

}


/* ============================================================
   BASE64URL
============================================================ */

function base64url(
    input
) {

    let bytes;

    if (
        input instanceof Uint8Array
    ) {

        bytes = input;

    } else {

        bytes =
            new TextEncoder().encode(
                String(input)
            );

    }


    let binary = "";

    const chunk =
        0x8000;


    for (
        let i = 0;
        i < bytes.length;
        i += chunk
    ) {

        binary += String.fromCharCode(
            ...bytes.subarray(
                i,
                Math.min(
                    i + chunk,
                    bytes.length
                )
            )
        );

    }


    return btoa(binary)
        .replace(
            /\+/g,
            "-"
        )
        .replace(
            /\//g,
            "_"
        )
        .replace(
            /=+$/,
            ""
        );

}


/* ============================================================
   NORMALIZE PRIVATE KEY
============================================================ */

function normalizePrivateKey(
    pem
) {

    if (
        typeof pem !==
        "string"
    ) {

        throw new Error(
            "JAAS_PRIVATE_KEY is not a string."
        );

    }


    let key =
        pem
            .replace(
                /^\uFEFF/,
                ""
            )
            .trim();


    /*
     * If Cloudflare Secret was pasted with literal \n
     * convert it back to real line breaks.
     */

    key =
        key.replace(
            /\\n/g,
            "\n"
        );


    /*
     * Remove accidental surrounding quotes.
     */

    if (
        (
            key.startsWith('"') &&
            key.endsWith('"')
        ) ||
        (
            key.startsWith("'") &&
            key.endsWith("'")
        )
    ) {

        key =
            key.slice(
                1,
                -1
            ).trim();

    }


    /*
     * Normalize Windows line endings.
     */

    key =
        key.replace(
            /\r\n/g,
            "\n"
        );


    key =
        key.replace(
            /\r/g,
            "\n"
        );


    return key.trim();

}


/* ============================================================
   PEM -> DER
============================================================ */

function pemToArrayBuffer(
    pem
) {

    const normalized =
        normalizePrivateKey(
            pem
        );


    /*
     * JaaS should normally provide a PKCS#8 key.
     */

    if (
        !normalized.includes(
            "-----BEGIN PRIVATE KEY-----"
        )
    ) {

        if (
            normalized.includes(
                "-----BEGIN RSA PRIVATE KEY-----"
            )
        ) {

            throw new Error(
                "Private key is PKCS#1 (BEGIN RSA PRIVATE KEY). JaaS/Cloudflare Worker requires PKCS#8 (BEGIN PRIVATE KEY)."
            );

        }


        throw new Error(
            "Invalid PEM format. Expected -----BEGIN PRIVATE KEY-----."
        );

    }


    if (
        !normalized.includes(
            "-----END PRIVATE KEY-----"
        )
    ) {

        throw new Error(
            "Private key is missing -----END PRIVATE KEY-----."
        );

    }


    const base64 =
        normalized
            .replace(
                /-----BEGIN PRIVATE KEY-----/g,
                ""
            )
            .replace(
                /-----END PRIVATE KEY-----/g,
                ""
            )
            .replace(
                /\s/g,
                ""
            );


    if (!base64) {

        throw new Error(
            "Private key body is empty."
        );

    }


    let binary;

    try {

        binary =
            atob(base64);

    } catch (error) {

        throw new Error(
            "Private key contains invalid Base64 data."
        );

    }


    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);

    }


    return bytes.buffer;

}


/* ============================================================
   IMPORT PRIVATE KEY
============================================================ */

async function importPrivateKey(
    privateKeyPem
) {

    const keyData =
        pemToArrayBuffer(
            privateKeyPem
        );


    try {

        return await crypto.subtle.importKey(

            "pkcs8",

            keyData,

            {
                name:
                    "RSASSA-PKCS1-v1_5",

                hash:
                    "SHA-256"
            },

            false,

            [
                "sign"
            ]

        );

    } catch (error) {

        throw new Error(
            "PKCS#8 private key import failed: " +
            (
                error &&
                error.message
                    ? error.message
                    : String(error)
            )
        );

    }

}


/* ============================================================
   CREATE JWT
============================================================ */

async function createJWT(
    privateKeyPem,
    name,
    room
) {

    const now =
        Math.floor(
            Date.now() / 1000
        );


    /*
     * Token lifetime:
     * 2 hours
     */

    const exp =
        now + (60 * 60 * 2);


    const userId =
        crypto.randomUUID();


    /* ========================================================
       JWT HEADER
    ======================================================== */

    const header = {

        alg:
            "RS256",

        kid:
            KID,

        typ:
            "JWT"

    };


    /* ========================================================
       JWT PAYLOAD
    ======================================================== */

    const payload = {

        aud:
            "jitsi",

        iss:
            "chat",

        sub:
            APP_ID,

        room:
            room,

        nbf:
            now - 5,

        exp:
            exp,


        context: {

            user: {

                id:
                    userId,

                name:
                    name,

                avatar:
                    "",

                email:
                    ""

            },


            features: {

                livestreaming:
                    false,

                recording:
                    false,

                transcription:
                    false,

                "sip-inbound-call":
                    false,

                "sip-outbound-call":
                    false,

                "inbound-call":
                    false,

                "outbound-call":
                    false

            }

        }

    };


    /* ========================================================
       ENCODE HEADER
    ======================================================== */

    const encodedHeader =
        base64url(
            JSON.stringify(
                header
            )
        );


    /* ========================================================
       ENCODE PAYLOAD
    ======================================================== */

    const encodedPayload =
        base64url(
            JSON.stringify(
                payload
            )
        );


    /* ========================================================
       UNSIGNED JWT
    ======================================================== */

    const unsignedToken =
        encodedHeader +
        "." +
        encodedPayload;


    /* ========================================================
       IMPORT PRIVATE KEY
    ======================================================== */

    const key =
        await importPrivateKey(
            privateKeyPem
        );


    /* ========================================================
       SIGN JWT
    ======================================================== */

    let signature;

    try {

        signature =
            await crypto.subtle.sign(

                {
                    name:
                        "RSASSA-PKCS1-v1_5"
                },

                key,

                new TextEncoder().encode(
                    unsignedToken
                )

            );

    } catch (error) {

        throw new Error(
            "JWT signing failed: " +
            (
                error &&
                error.message
                    ? error.message
                    : String(error)
            )
        );

    }


    /* ========================================================
       FINAL JWT
    ======================================================== */

    return (
        unsignedToken +
        "." +
        base64url(
            new Uint8Array(
                signature
            )
        )
    );

}


/* ============================================================
   REQUEST HANDLER
============================================================ */

export default {

    async fetch(
        request,
        env
    ) {

        const url =
            new URL(
                request.url
            );


        /* ======================================================
           OPTIONS
        ====================================================== */

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status:
                        204,

                    headers:
                        corsHeaders()
                }
            );

        }


        /* ======================================================
           HEALTH CHECK
        ====================================================== */

        if (
            url.pathname ===
            "/api/health"
        ) {

            return json({

                ok:
                    true,

                service:
                    "1v1 Video Call"

            });

        }


        /* ======================================================
           JWT ENDPOINT
        ====================================================== */

        if (
            url.pathname ===
            "/api/token"
        ) {

            if (
                request.method !==
                "POST"
            ) {

                return json(

                    {
                        error:
                            "Method not allowed."
                    },

                    405

                );

            }


            /* ==================================================
               PRIVATE KEY CHECK
            ================================================== */

            if (
                !env.JAAS_PRIVATE_KEY
            ) {

                return json(

                    {
                        error:
                            "JAAS_PRIVATE_KEY secret is not configured."
                    },

                    500

                );

            }


            /* ==================================================
               JSON BODY
            ================================================== */

            let body;


            try {

                body =
                    await request.json();

            } catch (_) {

                return json(

                    {
                        error:
                            "Invalid JSON."
                    },

                    400

                );

            }


            /* ==================================================
               NAME
            ================================================== */

            const name =
                String(
                    body.name || ""
                )
                .trim()
                .slice(
                    0,
                    40
                );


            /* ==================================================
               ROOM
            ================================================== */

            const room =
                String(
                    body.room || ""
                )
                .trim()
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    ""
                )
                .slice(
                    0,
                    40
                );


            /* ==================================================
               VALIDATION
            ================================================== */

            if (!name) {

                return json(

                    {
                        error:
                            "Name is required."
                    },

                    400

                );

            }


            if (!room) {

                return json(

                    {
                        error:
                            "Room is required."
                    },

                    400

                );

            }


            /* ==================================================
               CREATE TOKEN
            ================================================== */

            try {

                const token =
                    await createJWT(

                        env.JAAS_PRIVATE_KEY,

                        name,

                        room

                    );


                return json({

                    token:
                        token,

                    appId:
                        APP_ID

                });


            } catch (error) {

                console.error(
                    "JWT ERROR:",
                    error
                );


                /*
                 * Diagnostic information.
                 *
                 * This does NOT return the private key.
                 * It only returns the error message so
                 * we can identify the key/import problem.
                 */

                return json(

                    {
                        error:
                            "JWT generation failed.",

                        details:
                            error &&
                            error.message
                                ? error.message
                                : String(error)

                    },

                    500

                );

            }

        }


        /* ======================================================
           STATIC ASSETS
           
           index.html
           style.css
           app.js
           
           are served from Cloudflare Assets.
        ====================================================== */

        if (
            env.ASSETS
        ) {

            return env.ASSETS.fetch(
                request
            );

        }


        /* ======================================================
           FALLBACK
        ====================================================== */

        return new Response(

            "1v1 Video Call API",

            {
                status:
                    404
            }

        );

    }

};
