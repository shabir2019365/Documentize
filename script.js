const messagesContainer =
    document.getElementById("messages");

const promptInput =
    document.getElementById("prompt");

const sendBtn =
    document.getElementById("sendBtn");

const newChatBtn =
    document.getElementById("newChatBtn");

const chatHistoryEl =
    document.getElementById("chatHistory");

const providerStatus =
    document.getElementById("providerStatus");


let messages = [];
let currentChatId = null;

let chats =
    JSON.parse(
        localStorage.getItem("aiChats") || "[]"
    );


function saveChats() {

    localStorage.setItem(
        "aiChats",
        JSON.stringify(chats)
    );
}


function scrollToBottom() {

    messagesContainer.scrollTop =
        messagesContainer.scrollHeight;
}


function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


function formatResponse(text) {

    let html =
        escapeHtml(text);

    // Code blocks
    html = html.replace(
        /```([\s\S]*?)```/g,
        function (match, code) {

            return (
                "<pre><code>" +
                code.trim() +
                "</code></pre>"
            );
        }
    );

    // Inline code
    html = html.replace(
        /`([^`]+)`/g,
        "<code>$1</code>"
    );

    // Bold
    html = html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Italic
    html = html.replace(
        /\*(.*?)\*/g,
        "<em>$1</em>"
    );

    // New lines
    html = html.replace(
        /\n/g,
        "<br>"
    );

    return html;
}


function addMessage(role, content) {

    const welcome =
        document.getElementById("welcome");

    if (welcome) {
        welcome.remove();
    }

    const row =
        document.createElement("div");

    row.className =
        "message-row " +
        (role === "user"
            ? "user-message"
            : "assistant-message");

    const avatar =
        document.createElement("div");

    avatar.className = "avatar";

    avatar.textContent =
        role === "user" ? "You" : "✦";

    const contentDiv =
        document.createElement("div");

    contentDiv.className =
        "message-content";

    if (role === "user") {

        contentDiv.textContent =
            content;

    } else {

        contentDiv.innerHTML =
            formatResponse(content);

        const copyBtn =
            document.createElement("button");

        copyBtn.className = "copy-btn";
        copyBtn.textContent = "Copy";

        copyBtn.addEventListener("click", function () {

            navigator.clipboard.writeText(content)
                .then(function () {
                    copyBtn.textContent = "Copied!";

                    setTimeout(function () {
                        copyBtn.textContent = "Copy";
                    }, 1500);
                });
        });

        contentDiv.appendChild(copyBtn);
    }

    row.appendChild(avatar);
    row.appendChild(contentDiv);

    messagesContainer.appendChild(row);

    scrollToBottom();
}


function addLoadingMessage() {

    const row =
        document.createElement("div");

    row.className =
        "message-row assistant-message";

    row.id = "loadingMessage";

    row.innerHTML = `
        <div class="avatar">✦</div>
        <div class="message-content">
            Thinking...
        </div>
    `;

    messagesContainer.appendChild(row);

    scrollToBottom();
}


function removeLoadingMessage() {

    const loading =
        document.getElementById(
            "loadingMessage"
        );

    if (loading) {
        loading.remove();
    }
}


function renderChatHistory() {

    chatHistoryEl.innerHTML = "";

    chats
        .slice()
        .reverse()
        .forEach(function (chat) {

            const item =
                document.createElement("div");

            item.className =
                "chat-item" +
                (chat.id === currentChatId
                    ? " active"
                    : "");

            const titleSpan =
                document.createElement("span");

            titleSpan.className = "chat-title";
            titleSpan.textContent = chat.title;

            const deleteBtn =
                document.createElement("button");

            deleteBtn.className = "delete-chat";
            deleteBtn.textContent = "✕";

            deleteBtn.addEventListener(
                "click",
                function (e) {
                    e.stopPropagation();
                    deleteChat(chat.id);
                }
            );

            item.appendChild(titleSpan);
            item.appendChild(deleteBtn);

            item.addEventListener(
                "click",
                function () {
                    loadChat(chat.id);
                }
            );

            chatHistoryEl.appendChild(item);
        });
}


function deleteChat(id) {

    chats = chats.filter(function (c) {
        return c.id !== id;
    });

    saveChats();

    if (currentChatId === id) {
        startNewChat();
    } else {
        renderChatHistory();
    }
}


function loadChat(id) {

    const chat = chats.find(function (c) {
        return c.id === id;
    });

    if (!chat) {
        return;
    }

    currentChatId = chat.id;
    messages = chat.messages.slice();

    messagesContainer.innerHTML = "";

    messages.forEach(function (m) {
        addMessage(m.role, m.content);
    });

    renderChatHistory();
}


function startNewChat() {

    currentChatId = null;
    messages = [];

    messagesContainer.innerHTML = `
        <div id="welcome" class="welcome">
            <div class="welcome-icon">✦</div>
            <h2>How can I help you?</h2>
            <p>
                Ask me anything — technical questions,
                business analysis, coding, writing,
                research, ideas and more.
            </p>
        </div>
    `;

    providerStatus.textContent = "Ready";

    renderChatHistory();
}


function saveCurrentChat() {

    if (!messages.length) {
        return;
    }

    if (!currentChatId) {

        currentChatId =
            "chat_" + Date.now();

        const firstUserMsg =
            messages.find(function (m) {
                return m.role === "user";
            });

        const title =
            firstUserMsg
                ? firstUserMsg.content.slice(0, 40)
                : "New chat";

        chats.push({
            id: currentChatId,
            title: title,
            messages: messages
        });

    } else {

        const chat = chats.find(function (c) {
            return c.id === currentChatId;
        });

        if (chat) {
            chat.messages = messages;
        }
    }

    saveChats();
    renderChatHistory();
}


async function sendMessage() {

    const prompt =
        promptInput.value.trim();

    if (!prompt) {
        return;
    }

    promptInput.value = "";
    promptInput.style.height = "auto";

    addMessage("user", prompt);

    messages.push({
        role: "user",
        content: prompt
    });

    sendBtn.disabled = true;
    providerStatus.textContent = "Thinking...";

    addLoadingMessage();

    try {

        const response =
            await fetch("/api/chat", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    messages: messages
                })
            });

        const data = await response.json();

        removeLoadingMessage();

        if (!response.ok || data.error) {

            addMessage(
                "assistant",
                "⚠️ Error: " +
                    (data.error || "Something went wrong.")
            );

            providerStatus.textContent = "Error";

        } else {

            addMessage("assistant", data.text);

            messages.push({
                role: "assistant",
                content: data.text
            });

            providerStatus.textContent =
                "Ready · via " + data.provider;

            saveCurrentChat();
        }

    } catch (err) {

        removeLoadingMessage();

        addMessage(
            "assistant",
            "⚠️ Network error: " + err.message
        );

        providerStatus.textContent = "Error";

    } finally {

        sendBtn.disabled = false;
        promptInput.focus();
    }
}


// Auto-resize textarea
promptInput.addEventListener("input", function () {

    promptInput.style.height = "auto";

    promptInput.style.height =
        Math.min(promptInput.scrollHeight, 180) + "px";
});


// Enter = send, Shift+Enter = new line
promptInput.addEventListener("keydown", function (e) {

    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});


sendBtn.addEventListener("click", sendMessage);

newChatBtn.addEventListener("click", startNewChat);


// Init
renderChatHistory();
