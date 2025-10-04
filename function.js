/**
 * @name PDF Fetcher
 * @description Ce code envoie une URL à un service externe (n8n via GitHub) pour récupérer un fichier PDF
 * qui force le téléchargement, attend la réponse, puis retourne une URL d'affichage pour le Web Embed de Glide.
 */
window.function = async function (jsonData, githubToken, repoOwner, repoName, filePath) {
    // --- 1. RÉCUPÉRATION DES PARAMÈTRES DE GLIDE ---
    // jsonData : Le JSON envoyé depuis Glide, ex: { "action": "fetchPdf", "url": "..." }
    // githubToken : Votre Personal Access Token pour l'authentification
    // repoOwner : Le propriétaire du dépôt GitHub (ex: "goraskills")
    // repoName : Le nom du dépôt (ex: "glide-webhook-bridge")
    // filePath : Le chemin du fichier de commande (ex: "data.json")
    const json = jsonData.value ?? '{}';
    const token = githubToken.value;
    const owner = repoOwner.value;
    const repo = repoName.value;
    const path = filePath.value ?? 'data.json';
    const responsePath = "response.json"; // Le fichier de réponse que nous attendons

    // --- Validation de base ---
    if (!token || !owner || !repo || !json) {
        return "Erreur: Token, Propriétaire, Dépôt et Données JSON sont requis.";
    }


    // --- 2. FONCTION D'ATTENTE INTELLIGENTE (POLLING) ---
    // Cette fonction va vérifier à intervalles réguliers si une NOUVELLE réponse est arrivée.
    async function pollForResponse(initialSha) {
        const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${responsePath}`;
        let attempts = 0;
        const maxAttempts = 20; // Attente maximale de 60 secondes (20 tentatives x 3s)
        
        while (attempts < maxAttempts) {
            // Astuce anti-cache : on ajoute un timestamp à l'URL pour forcer le navigateur à la recharger
            const urlWithCacheBust = `${baseUrl}?t=${new Date().getTime()}`;
            
            try {
                const res = await fetch(urlWithCacheBust, {
                    method: 'GET',
                    headers: { 'Authorization': `token ${token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    
                    // On n'accepte la réponse que si elle est NOUVELLE (le 'sha' a changé)
                    if (data.sha !== initialSha) {
                        // On décode le contenu de la réponse (qui est en Base64)
                        const content = decodeURIComponent(escape(atob(data.content)));
                        
                        // --- Logique Spécifique pour le PDF ---
                        // On parse le JSON de la réponse pour extraire l'URL du PDF
                        const responseData = JSON.parse(content);

                        if (responseData.status === "succes" && responseData.pdfUrl) {
                            const pdfUrl = responseData.pdfUrl;
                            
                            // On construit l'URL d'affichage avec Google Docs Viewer
                            const displayUrl = `https://docs.google.com/gview?url=${pdfUrl}&embedded=true`;
                            
                            // On retourne cette URL finale à Glide
                            return displayUrl;
                        } else {
                            // Si la réponse n'est pas ce qu'on attend, on retourne le contenu brut
                            return `Réponse inattendue: ${content}`;
                        }
                    }
                }
            } catch (error) { /* On ignore les erreurs de réseau pendant l'attente */ }
            
            attempts++;
            // On attend 3 secondes avant la prochaine tentative
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        return "Erreur: Le délai d'attente pour la réponse a été dépassé (60 secondes).";
    }


    // --- 3. RÉCUPÉRATION DE L'IDENTIFIANT DE L'ANCIENNE RÉPONSE ---
    // C'est crucial pour s'assurer qu'on ne lit pas une ancienne réponse en cache.
    let initialResponseSha;
    try {
        const initialResponseUrl = `${`https://api.github.com/repos/${owner}/${repo}/contents/${responsePath}`}?t=${new Date().getTime()}`;
        const initialResponse = await fetch(initialResponseUrl, { headers: { 'Authorization': `token ${token}` }});
        if (initialResponse.ok) {
            initialResponseSha = (await initialResponse.json()).sha;
        }
    } catch(e) { /* Si le fichier n'existe pas, c'est normal. On continue. */ }


    // --- 4. ENVOI DE LA COMMANDE À GITHUB ---
    // On envoie le JSON de Glide au fichier `data.json` pour déclencher le workflow n8n.
    const initialUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const contentEncoded = btoa(unescape(encodeURIComponent(json)));

    try {
        let sha;
        const existingFile = await fetch(initialUrl, { headers: { 'Authorization': `token ${token}` }});
        if (existingFile.ok) sha = (await existingFile.json()).sha;

        const response = await fetch(initialUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Glide Data Push: ${new Date().toISOString()}`,
                content: contentEncoded,
                sha: sha
            })
        });

        if (!response.ok) {
            const errorResult = await response.json();
            return `Erreur GitHub lors de l'envoi: ${errorResult.message}`;
        }

        // --- 5. DÉCLENCHEMENT DE L'ATTENTE ---
        // Si l'envoi a réussi, on commence à attendre la nouvelle réponse.
        return await pollForResponse(initialResponseSha);

    } catch (error) {
        return `Erreur de Connexion: ${error.message}`;
    }
}
