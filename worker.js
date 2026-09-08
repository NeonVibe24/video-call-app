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
            status,

            headers:
                corsHeaders()
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
        input instanceof
        Uint8Array
    ) {

        bytes = input;

    } else {

        bytes =
            new TextEncoder().encode(
                input
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
   PEM -> DER
============================================================ */

function pemToArrayBuffer(
    pem
) {

    const base64 =
        pem
            .replace(
                /-----BEGIN [^-]+-----/g,
                ""
            )
            .replace(
                /-----END [^-]+-----/g,
                ""
            )
            .replace(
                /\s/g,
                ""
            );


    const binary =
        atob(base64);


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


    return crypto.subtle.importKey(

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
        now + 60 * 60 * 2;


    const userId =
        crypto.randomUUID();


    const header = {

        alg:
            "RS256",

        kid:
            KID,

        typ:
            "JWT"

    };


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


    const encodedHeader =
        base64url(
            JSON.stringify(
                header
            )
        );


    const encodedPayload =
        base64url(
            JSON.stringify(
                payload
            )
        );


    const unsignedToken =
        encodedHeader +
        "." +
        encodedPayload;


    const key =
        await importPrivateKey(
            privateKeyPem
        );


    const signature =
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


        /*
         * OPTIONS
         */

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {
                    status: 204,
                    headers:
                        corsHeaders()
                }
            );

        }


        /*
         * Health check
         */

        if (
            url.pathname ===
            "/api/health"
        ) {

            return json({
                ok: true,
                service:
                    "1v1 Video Call"
            });

        }


        /*
         * JWT endpoint
         */

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


            const name =
                String(
                    body.name || ""
                )
                .trim()
                .slice(0, 40);


            const room =
                String(
                    body.room || ""
                )
                .trim()
                .replace(
                    /[^a-zA-Z0-9_-]/g,
                    ""
                )
                .slice(0, 40);


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
                    error
                );


                return json(
                    {
                        error:
                            "JWT generation failed."
                    },
                    500
                );

            }

        }


        /*
         * Frontend files are served by
         * Cloudflare Pages / your static host.
         */

        return new Response(
            "1v1 Video Call API",
            {
                status: 404
            }
        );

    }

};
