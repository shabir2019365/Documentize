const messagesContainer = document.getElementById("messages");
const promptInput = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const chatHistoryEl = document.getElementById("chatHistory");
const providerStatus = document.getElementById("providerStatus");
const chatTitleEl = document.getElementById("chatTitle");
const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const scrim = document.getElementById("scrim");

let messages = [];
let currentChatId = null;

let chats = [];

try {
    chats = JSON.parse(localStorage.getItem("relayChats") || "[]");
} catch (e) {
    chats = [];
}

function saveChats() {
    try {
        localStorage.setItem("relayChats", JSON.stringify(chats));
    } catch (e) {
        // storage unavailable — chat still works for this session
    }
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatResponse(text) {
    let html = escapeHtml(text);

    html = html.replace(/```([a-zA-Z0-9]*)\n?([\s\S]*?)```/g, function (match, lang, code) {
        return "<pre><code>" + code.trim() + "</code></pre>";
    });

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    html = html.replace(/\n/g, "<br>");

    return html;
}

function closeSidebarOnMobile() {
    sidebar.classList.remove("open");
    scrim.classList.remove("visible");
}

function addMessage(role, content, isError) {
    const welcome = document.getElementById("welcome");
    if (welcome) {
        welcome.remove();
    }

    const row = document.createElement("div");
    row.className =
        "message-row " +
        (role === "user" ? "user-message" : "assistant-message") +
        (isError ? " error-message" : "");

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    if (role === "user") {
        contentDiv.textContent = content;
    } else {
        contentDiv.innerHTML = formatResponse(content);

        if (!isError) {
            const copyBtn = document.createElement("button");
            copyBtn.className = "copy-btn";
            copyBtn.textContent = "Copy";

            copyBtn.addEventListener("click", function () {
                navigator.clipboard.writeText(content).then(function () {
                    copyBtn.textContent = "Copied";
                    setTimeout(function () {
                        copyBtn.textContent = "Copy";
                    }, 1400);
                });
            });

            contentDiv.appendChild(copyBtn);
        }
    }

    row.appendChild(contentDiv);
    messagesContainer.appendChild(row);
    scrollToBottom();
}

function addLoadingMessage() {
    const row = document.createElement("div");
    row.className = "message-row assistant-message";
    row.id = "loadingMessage";

    row.innerHTML =
        '<div class="message-content loading">' +
        '<span class="typing-dots"><span></span><span></span><span></span></span>' +
        "</div>";

    messagesContainer.appendChild(row);
    scrollToBottom();
}

function removeLoadingMessage() {
    const loading = document.getElementById("loadingMessage");
    if (loading) {
        loading.remove();
    }
}

function renderChatHistory() {
    chatHistoryEl.innerHTML = "";

    if (!chats.length) {
        const empty = document.createElement("div");
        empty.className = "empty-history";
        empty.textContent = "No conversations yet";
        chatHistoryEl.appendChild(empty);
        return;
    }

    chats
        .slice()
        .reverse()
        .forEach(function (chat) {
            const item = document.createElement("div");
            item.className = "chat-item" + (chat.id === currentChatId ? " active" : "");

            const titleSpan = document.createElement("span");
            titleSpan.className = "chat-title";
            titleSpan.textContent = chat.title;

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-chat";
            deleteBtn.textContent = "\u2715";

            deleteBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                deleteChat(chat.id);
            });

            item.appendChild(titleSpan);
            item.appendChild(deleteBtn);

            item.addEventListener("click", function () {
                loadChat(chat.id);
                closeSidebarOnMobile();
            });

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
    chatTitleEl.textContent = chat.title;

    messagesContainer.innerHTML = "";
    messages.forEach(function (m) {
        addMessage(m.role, m.content);
    });

    renderChatHistory();
}

function startNewChat() {
    currentChatId = null;
    messages = [];
    chatTitleEl.textContent = "New conversation";

    messagesContainer.innerHTML =
        '<div id="welcome" class="welcome">' +
        '<span class="welcome-mark">Relay</span>' +
        "<h2>What's on your mind?</h2>" +
        "<p>Ask a question, paste something to work through, or just start typing.</p>" +
        "</div>";

    providerStatus.textContent = "Ready";
    renderChatHistory();
    closeSidebarOnMobile();
}

function saveCurrentChat() {
    if (!messages.length) {
        return;
    }

    if (!currentChatId) {
        currentChatId = "chat_" + Date.now();

        const firstUserMsg = messages.find(function (m) {
            return m.role === "user";
        });

        const title = firstUserMsg
            ? firstUserMsg.content.slice(0, 42)
            : "New conversation";

        chats.push({ id: currentChatId, title: title, messages: messages });
        chatTitleEl.textContent = title;
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
    const prompt = promptInput.value.trim();

    if (!prompt || sendBtn.disabled) {
        return;
    }

    promptInput.value = "";
    promptInput.style.height = "auto";

    addMessage("user", prompt);
    messages.push({ role: "user", content: prompt });

    sendBtn.disabled = true;
    providerStatus.textContent = "Thinking…";
    addLoadingMessage();

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: messages }),
        });

        const data = await response.json();

        removeLoadingMessage();

        if (!response.ok || data.error) {
            addMessage("assistant", data.error || "Something went wrong. Try again.", true);
            providerStatus.textContent = "Error";
        } else {
            addMessage("assistant", data.text);
            messages.push({ role: "assistant", content: data.text });
            providerStatus.textContent = "Ready \u00b7 via " + data.provider;
            saveCurrentChat();
        }
    } catch (err) {
        removeLoadingMessage();
        addMessage("assistant", "Network error: " + err.message, true);
        providerStatus.textContent = "Error";
    } finally {
        sendBtn.disabled = false;
        promptInput.focus();
    }
}

promptInput.addEventListener("input", function () {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + "px";
});

promptInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", startNewChat);

menuBtn.addEventListener("click", function () {
    sidebar.classList.add("open");
    scrim.classList.add("visible");
});

scrim.addEventListener("click", closeSidebarOnMobile);

renderChatHistory();
