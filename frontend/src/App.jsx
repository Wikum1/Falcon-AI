import { useState, useEffect, useRef } from "react";
import "./App.css";

// 🔗 Backend base URL (Replit in production, localhost for dev)
const API_BASE =
  import.meta.env.VITE_API_BASE || "https://replit.com/@wikumsurindu542/Falcon-AI?deploymentPane=true";


// Helper to create a fresh empty chat
function createNewChat() {
  return {
    id: Date.now().toString(), // simple unique id
    title: "New chat",
    createdAt: Date.now(),
    messages: [
      {
        sender: "bot",
        text: "Hi! I'm your Falcon AI 🤖. Ask me anything!",
        provider: "groq",
      },
    ],
  };
}

// Helper: per-user chats key
function getChatsKey(userOrEmail) {
  const email =
    typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email;
  return email ? `wikum_ai_chats_${email}` : "wikum_ai_chats_guest";
}

function App() {
  // 🔹 Auth state
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"

  // 🔹 All chats (multi-chat) — start with a dummy new chat, real data is loaded after login
  const [chats, setChats] = useState([createNewChat()]);

  // 🔹 Which chat is currently open
  const [activeChatId, setActiveChatId] = useState(null);

  // Ensure we always have a valid active chat
  const activeChat =
    chats.find((c) => c.id === activeChatId) || chats[0] || createNewChat();

  useEffect(() => {
    if (!activeChatId && chats[0]) {
      setActiveChatId(chats[0].id);
    }
  }, [activeChatId, chats]);

  // 🔹 UI state
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // modes: now includes "image"
  const [mode, setMode] = useState("general"); // general/coding/study/cv/sinhala/image
  const [provider, setProvider] = useState("groq");
  const [searchTerm, setSearchTerm] = useState("");

  // Voice
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  // Image upload
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // 🌦 Weather state
  const [weatherCity, setWeatherCity] = useState("Colombo");
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  // 🔹 Load logged-in user from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem("wikum_ai_user");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.user && parsed?.token) {
        setUser(parsed.user);
        setToken(parsed.token);
      }
    } catch {
      // ignore
    }
  }, []);

  // 🔹 When user changes (login/logout), load that user's chats from localStorage
  useEffect(() => {
    if (!user) return;

    const key = getChatsKey(user.email);
    const raw = localStorage.getItem(key);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChats(parsed);
          setActiveChatId(parsed[0].id);
          return;
        }
      } catch (e) {
        console.error("Error parsing user chats from localStorage", e);
      }
    }

    // No saved chats for this user → start fresh
    const fresh = createNewChat();
    setChats([fresh]);
    setActiveChatId(fresh.id);
  }, [user]);

  // 🔹 Save chats to the correct key whenever they change
  useEffect(() => {
    if (!user) return;
    const key = getChatsKey(user.email);
    localStorage.setItem(key, JSON.stringify(chats));
  }, [chats, user]);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + text : text));
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
  }, []);

  // 🌦 Weather fetch helper
  const fetchWeather = async () => {
    if (!weatherCity.trim()) return;
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const res = await fetch(`${API_BASE}/api/tools/weather`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: weatherCity }),
      });

      const data = await res.json();

      if (!res.ok) {
        setWeatherError(data.error || "Failed to fetch weather");
        setWeatherData(null);
      } else {
        setWeatherData(data);
      }
    } catch (err) {
      console.error("Weather error:", err);
      setWeatherError("Network error");
      setWeatherData(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  // Load default weather once
  useEffect(() => {
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived flags/lists
  const hasUserMessages = activeChat.messages.some(
    (m) => m.sender === "user"
  );

  const filteredChats = chats.filter((c) =>
    (c.title || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Voice output
  const speakText = (text) => {
    if (!voiceEnabled) return;
    if (!("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  const handleMicClick = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert("Voice input is not supported in this browser.");
      return;
    }

    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      try {
        recognition.start();
        setIsRecording(true);
      } catch {
        setIsRecording(false);
      }
    }
  };

  // 2025-aware system prompt
  const getSystemPrompt = () => {
    const dateLine =
      "Today's date is February 2025. Use the most accurate and up-to-date knowledge available. " +
      "If you are unsure about anything, answer honestly instead of guessing.";

    switch (mode) {
      case "coding":
        return (
          "You are a professional coding tutor helping an IT undergraduate in 2025. " +
          "Explain concepts clearly with step-by-step instructions. " +
          "Use modern frameworks and 2025 standards (React 19+, Node 20+, Java 21, Kotlin 2.0+, Tailwind, modern MERN best practices). " +
          dateLine
        );

      case "study":
        return (
          "You help university students understand academic subjects in 2025. " +
          "Explain topics in simple English with examples, bullet points, and clear reasoning. " +
          "Focus on updated 2025 content, IT standards, and modern knowledge. " +
          dateLine
        );

      case "cv":
        return (
          "You help students improve CVs, cover letters, LinkedIn profiles, and job applications. " +
          "Give 2025 recruitment trends, ATS-friendly suggestions, modern skill keywords, and professional tone. " +
          dateLine
        );

      case "sinhala":
        return (
          "You are a Sinhala translator and explainer. Translate between English and Sinhala accurately. " +
          "Explain meanings in simple Sinhala when needed. " +
          dateLine
        );

      case "image":
        return (
          "You are an AI that helps generate images from text prompts. " +
          "The actual image will be produced by a separate image model. " +
          "Help the user improve prompts if needed. " +
          dateLine
        );

      default:
        return (
          "You are a friendly AI assistant helping an IT undergraduate in 2025. " +
          "Explain things simply with examples, keep answers updated, and provide practical help. " +
          dateLine
        );
    }
  };

  // ---------- AUTH HANDLERS ----------
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const name = form.get("name");
    const email = form.get("email");
    const password = form.get("password");

    const endpoint =
      authMode === "register"
        ? `${API_BASE}/api/auth/register`
        : `${API_BASE}/api/auth/login`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          authMode === "register"
            ? { name, email, password }
            : { email, password }
        ),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Authentication failed");
        return;
      }

      // ✅ store user + token
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem(
        "wikum_ai_user",
        JSON.stringify({ user: data.user, token: data.token })
      );

      // ✅ After login/register, load or create chats for THIS user
      const chatsKey = getChatsKey(data.user.email);
      const existing = localStorage.getItem(chatsKey);

      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChats(parsed);
            setActiveChatId(parsed[0].id);
            return;
          }
        } catch (err) {
          console.error("Error parsing existing user chats", err);
        }
      }

      // No saved chats (new user or first time) → fresh chat
      const freshChat = createNewChat();
      setChats([freshChat]);
      setActiveChatId(freshChat.id);
      localStorage.setItem(chatsKey, JSON.stringify([freshChat]));
    } catch (err) {
      console.error("Auth error:", err);
      alert("Server error");
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("wikum_ai_user");
    // keep chats in localStorage per user, so when they log in again they come back
  };

  // ---------- NEW CHAT ----------
  const handleNewChat = () => {
    const newChat = createNewChat();
    setChats((prev) => [...prev, newChat]);
    setActiveChatId(newChat.id);
    setInput("");
    setImageFile(null);
    setImagePreview(null);
    setSearchTerm("");
  };

  // ---------- CLEAR CURRENT CHAT ----------
  const clearCurrentChat = () => {
    if (!activeChat) return;
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? {
              ...chat,
              title: "New chat",
              messages: [
                {
                  sender: "bot",
                  text: "Hi! I'm your Falcon AI 🤖. Ask me anything!",
                  provider: "groq",
                },
              ],
            }
          : chat
      )
    );
    setInput("");
    setImageFile(null);
    setImagePreview(null);
  };

  // ---------- SEND MESSAGE ----------
  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !imageFile) || loading || !activeChat) return;

    let userText = input.trim() || "";

    if (imageFile) {
      userText += `\n\n[User has attached an image: "${imageFile.name}". Backend cannot see the actual pixels.]`;
    }

    // 1) Add user message to the active chat
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== activeChat.id) return chat;

        const newMessages = [
          ...chat.messages,
          { sender: "user", text: userText },
        ];

        // First user message -> use it as chat title
        let newTitle = chat.title;
        if (newTitle === "New chat") {
          const trimmed = userText.replace(/\s+/g, " ").trim();
          newTitle =
            trimmed.length > 40 ? trimmed.slice(0, 40) + "..." : trimmed;
        }

        return { ...chat, messages: newMessages, title: newTitle };
      })
    );

    setInput("");
    setImageFile(null);
    setImagePreview(null);
    setLoading(true);

    // 🔥 Special branch: IMAGE MODE (uses /api/image/generate)
    if (mode === "image") {
      try {
        const res = await fetch(`${API_BASE}/api/image/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({ prompt: userText }),
        });

        const data = await res.json();

        if (!res.ok || !data.imageBase64) {
          const errMsg = data.error || "Image generation failed.";
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === activeChat.id
                ? {
                    ...chat,
                    messages: [
                      ...chat.messages,
                      { sender: "bot", text: `⚠️ ${errMsg}` },
                    ],
                  }
                : chat
            )
          );
        } else {
          // Add generated image as a bot message
          setChats((prev) =>
            prev.map((chat) =>
              chat.id === activeChat.id
                ? {
                    ...chat,
                    messages: [
                      ...chat.messages,
                      {
                        sender: "bot",
                        text: "Here is your generated image 🎨",
                        provider: "huggingface",
                        imageUrl: data.imageBase64, // base64 image
                      },
                    ],
                  }
                : chat
            )
          );
        }
      } catch (err) {
        console.error("Image chat error:", err);
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === activeChat.id
              ? {
                  ...chat,
                  messages: [
                    ...chat.messages,
                    {
                      sender: "bot",
                      text: "⚠️ Error contacting image server.",
                    },
                  ],
                }
              : chat
          )
        );
      } finally {
        setLoading(false);
      }

      // ❗ stop here for image mode
      return;
    }

    // 🔁 Normal text chat for other modes
    try {
      const historyMessages = activeChat.messages;

      const formattedMessages = [
        { role: "system", content: getSystemPrompt() },
        ...historyMessages.map((m) => ({
          role: m.sender === "user" ? "user" : "assistant",
          content: m.text,
        })),
        { role: "user", content: userText },
      ];

      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          provider,
          messages: formattedMessages,
        }),
      });

      const data = await res.json();
      const botText = data.reply || data.error || "Hmm, I couldn't reply.";

      // 2) Add bot message to the same chat
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat.id
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    sender: "bot",
                    text: botText,
                    provider: data.provider ?? provider,
                  },
                ],
              }
            : chat
        )
      );

      speakText(botText);
    } catch (err) {
      console.error("Chat error:", err);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === activeChat.id
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    sender: "bot",
                    text: "⚠️ Error contacting server.",
                  },
                ],
              }
            : chat
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  // =====================================================
  //  AUTH SCREEN: if not logged in, show login/register
  // =====================================================
  if (!user || !token) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          {/* ⭐ Logo Section */}
          <div className="auth-logo-wrap">
            <img
              src="/Falcon.png"
              alt="Falcon AI Logo"
              className="auth-logo"
            />
            <h1 className="auth-title">Falcon AI</h1>
            <p className="auth-sub">Sign in to use your Falcon AI</p>
          </div>

          {/* Tabs */}
          <div className="auth-toggle">
            <button
              className={authMode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Log in
            </button>
            <button
              className={
                authMode === "register" ? "auth-tab active" : "auth-tab"
              }
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="auth-form">
            {authMode === "register" && (
              <input
                name="name"
                placeholder="Full name"
                className="auth-input"
                required
              />
            )}
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="auth-input"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Password (min 6 characters)"
              className="auth-input"
              required
            />
            <button type="submit" className="auth-button">
              {authMode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =====================================================
  //  MAIN APP (after login)
  // =====================================================
  return (
    <div className={`app-container ${true ? "dark" : "light"}`}>
      <div className="app-wrapper">
        {/* 🔹 SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-scroll">
            {/* Header / logo + provider */}
            <div className="sidebar-header">
              <div className="sidebar-logo-row">
                <img
                  src="/Falcon.png"
                  alt="Falcon AI Logo"
                  className="sidebar-logo-img"
                />
                <div>
                  <div className="sidebar-logo-title">Falcon AI</div>
                </div>
              </div>

              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mode-btn provider-select"
              >
                <option value="groq">Groq · LLaMA 3.1</option>
                <option value="gemini">Gemini · 2.0 Flash</option>
                <option value="deepseek">DeepSeek · Chat</option>
                <option value="huggingface">HuggingFace · BlenderBot</option>
              </select>
            </div>

            {/* Main nav like ChatGPT */}
            <nav className="sidebar-main-nav">
              <button className="nav-item" onClick={handleNewChat}>
                <span className="nav-icon">＋</span>
                <span>New chat</span>
              </button>

              <div className="nav-item nav-search">
                <span className="nav-icon">🔍︎</span>
                <input
                  className="nav-search-input"
                  placeholder="Search chats"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <button
                className="nav-item"
                onClick={() => alert("Library coming soon 🕮")}
              >
                <span className="nav-icon">🕮</span>
                <span>Library</span>
              </button>

              <button
                className="nav-item"
                onClick={() => alert("Projects coming soon 🖿")}
              >
                <span className="nav-icon">🖿</span>
                <span>Projects</span>
              </button>

              <button className="nav-item" onClick={clearCurrentChat}>
                <span className="nav-icon">🗑️</span>
                <span>Clear current chat</span>
              </button>
            </nav>

            {/* Your chats list (each chat = folder) */}
            <div className="sidebar-section">
              <h3>Your chats</h3>
              <ul className="chat-history-list">
                {filteredChats
                  .slice()
                  .reverse()
                  .map((chat) => (
                    <li
                      key={chat.id}
                      className={
                        chat.id === activeChat.id ? "chat-history-active" : ""
                      }
                      onClick={() => setActiveChatId(chat.id)}
                      title={chat.title}
                    >
                      {chat.title}
                    </li>
                  ))}
                {filteredChats.length === 0 && (
                  <li className="chat-history-empty">No chats yet.</li>
                )}
              </ul>
            </div>

            {/* Modes */}
            <div className="sidebar-section">
              <h3>Modes</h3>
              <div className="modes-wrap">
                {[
                  { id: "general", label: "General" },
                  { id: "coding", label: "Coding" },
                  { id: "study", label: "Study" },
                  { id: "cv", label: "CV & Careers" },
                  { id: "sinhala", label: "සිංහල" },
                  { id: "image", label: "Images" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`mode-btn ${mode === m.id ? "active" : ""}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 🌦 Weather widget */}
            <div className="sidebar-section">
              <h3>Weather</h3>
              <div
                style={{
                  borderRadius: "10px",
                  border: "1px solid #1f2937",
                  padding: "8px",
                  fontSize: "12px",
                  background: "#020617",
                }}
              >
                <div
                  style={{ display: "flex", gap: "6px", marginBottom: "6px" }}
                >
                  <input
                    value={weatherCity}
                    onChange={(e) => setWeatherCity(e.target.value)}
                    placeholder="City (e.g. Colombo)"
                    style={{
                      flex: 1,
                      borderRadius: "999px",
                      border: "1px solid #1f2937",
                      background: "#020617",
                      color: "#e5e7eb",
                      padding: "4px 8px",
                      fontSize: "12px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={fetchWeather}
                    style={{
                      borderRadius: "999px",
                      border: "1px solid #1f2937",
                      background: "#111827",
                      color: "#e5e7eb",
                      padding: "4px 8px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    ↻
                  </button>
                </div>

                {weatherLoading && <p>Loading...</p>}
                {weatherError && <p>⚠️ {weatherError}</p>}
                {weatherData && !weatherLoading && !weatherError && (
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {weatherData.city}, {weatherData.country}
                    </div>
                    <div style={{ fontSize: "20px", marginTop: "2px" }}>
                      {Math.round(weatherData.temp)}°C
                    </div>
                    <div style={{ color: "#9ca3af" }}>
                      Feels like {Math.round(weatherData.feels_like)}°C ·{" "}
                      {weatherData.humidity}% humidity
                    </div>
                    <div
                      style={{
                        textTransform: "capitalize",
                        marginTop: "2px",
                      }}
                    >
                      {weatherData.description}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer (profile + theme/voice) */}
          <div className="sidebar-footer">
            <div className="footer-buttons">
              <button
                onClick={() => alert("Theme toggle already dark 😄")}
                className="btn"
              >
                🌙 Dark
              </button>
              <button
                onClick={() => setVoiceEnabled((v) => !v)}
                className="btn"
              >
                {voiceEnabled ? "🔊 Voice" : "🔇 Voice"}
              </button>
            </div>

            <div className="profile-card">
              <div className="profile-avatar">
                {user?.name ? user.name[0]?.toUpperCase() : "U"}
              </div>
              <div className="profile-info">
                <div className="profile-name">
                  {user?.name || "Logged user"}
                </div>
                <div className="profile-plan">
                  {user?.email || "Email not set"}
                </div>
              </div>
              <button className="profile-upgrade" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* 🔹 MAIN CHAT AREA */}
        <main className="chat-area">
          {/* Home screen when no user messages in this chat */}
          {!hasUserMessages ? (
            <div className="home-hero">
              <h1 className="home-title">Where should we begin?</h1>
              <p className="home-subtitle">
                Ask about coding, uni subjects, CVs, images, or anything else.
              </p>

              <form className="home-input-form" onSubmit={sendMessage}>
                <div className="home-input-bar">
                  <span className="home-plus">＋</span>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask me anything to get started..."
                    className="home-input"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="home-send"
                  >
                    ⮞
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <header>
                <h2>Falcon Chat</h2>
                <p className="subtitle">
                  Ask coding questions, study help, CV tips, translations, or
                  image ideas.
                </p>
              </header>

              <section className="chat-box">
                {activeChat.messages.map((m, i) => {
                  const isUser = m.sender === "user";
                  const providerLabel =
                    m.provider === "gemini"
                      ? "Gemini"
                      : m.provider === "deepseek"
                      ? "DeepSeek"
                      : m.provider === "huggingface"
                      ? "HuggingFace"
                      : m.provider === "groq"
                      ? "Groq"
                      : null;

                  return (
                    <div
                      key={i}
                      className={`chat-row ${
                        isUser ? "chat-row-user" : "chat-row-bot"
                      }`}
                    >
                      <div className="chat-bubble-wrapper">
                        <div
                          className={`avatar ${
                            isUser ? "avatar-user" : "avatar-bot"
                          }`}
                        >
                          {isUser ? "👤" : "𓅇"}
                        </div>
                        <div className={isUser ? "bubble-user" : "bubble-bot"}>
                          {!isUser && providerLabel && (
                            <div className="provider-pill">
                              {providerLabel}
                            </div>
                          )}
                          <div>{m.text}</div>

                          {/* 🔥 Show generated image if present */}
                          {m.imageUrl && (
                            <img
                              src={m.imageUrl}
                              alt="Generated by AI"
                              className="generated-image"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {loading && (
                  <p className="typing-text">🤖 Falcon is thinking…</p>
                )}
              </section>

              {imagePreview && (
                <section className="image-section">
                  <p>Attached image:</p>
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="image-preview"
                  />
                </section>
              )}

              <form className="input-section" onSubmit={sendMessage}>
                <div className="input-row">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      mode === "image"
                        ? "Describe the image you want me to generate..."
                        : "Type your question..."
                    }
                    className="input-box"
                  />
                  <button
                    type="button"
                    onClick={handleMicClick}
                    className={`mic-btn ${isRecording ? "mic-active" : ""}`}
                  >
                    {isRecording ? "🎙️" : "🎤"}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="send-btn"
                  >
                    {loading ? "..." : "Send"}
                  </button>
                </div>

                <div className="file-row">
                  <label className="file-label">
                    📎 Attach image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      hidden
                    />
                  </label>
                  {imageFile && (
                    <span className="file-name">{imageFile.name}</span>
                  )}
                </div>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
