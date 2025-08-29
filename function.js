window.function = function (jsonData, githubToken, repoOwner, repoName, filePath) {
    // --- Get values from Glide ---
    const json = jsonData.value ?? "{}";
    const token = githubToken.value;
    const owner = repoOwner.value;
    const repo = repoName.value;
    const path = filePath.value ?? "data.json";

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
            button { background-color: #2ea44f; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; transition: background-color 0.3s; }
            button:hover { background-color: #2c974b; }
            button:disabled { background-color: #94d3a2; cursor: not-allowed; }
            p { margin-top: 15px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div style="text-align: center;">
            <button id="triggerButton">Déclencher le Webhook</button>
            <p id="status"></p>
        </div>

        <script>
            document.getElementById('triggerButton').addEventListener('click', async function() {
                const button = this;
                const status = document.getElementById('status');

                // Disable button and show status
                button.disabled = true;
                button.innerText = 'Envoi en cours...';
                status.innerText = '';

                const url = \`https://api.github.com/repos/${owner}/${repo}/contents/${path}\`;
                const contentEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(JSON.parse(${JSON.stringify(json)}))))); // Robust Base64 encoding

                try {
                    let sha;
                    const existingFileResponse = await fetch(url, {
                        method: 'GET',
                        headers: { 'Authorization': \`token ${token}\` }
                    });
                    if (existingFileResponse.ok) {
                        sha = (await existingFileResponse.json()).sha;
                    }

                    const response = await fetch(url, {
                        method: 'PUT',
                        headers: {
                            'Authorization': \`token ${token}\`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: \`Glide Data Push: \${new Date().toISOString()}\`,
                            content: contentEncoded,
                            sha: sha
                        })
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(result.message);

                    status.innerText = 'Succès ! Workflow déclenché.';
                    status.style.color = 'green';
                    button.innerText = 'Déclenché !';

                } catch (error) {
                    status.innerText = 'Erreur: ' + error.message;
                    status.style.color = 'red';
                    button.innerText = 'Réessayer';
                    button.disabled = false;
                }
            });
        <\/script>
    </body>
    </html>
    `;

    return "data:text/html;charset=utf-8," + encodeURIComponent(htmlContent);
}
