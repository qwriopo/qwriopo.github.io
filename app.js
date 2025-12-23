import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getDatabase, ref, set, push, onValue, get, update, off
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyDyAtNIrWfsROkqi8op6zynWZfjBwEMeh8",
    authDomain: "mess-db5a2.firebaseapp.com",
    databaseURL: "https://mess-db5a2-default-rtdb.firebaseio.com",
    projectId: "mess-db5a2",
    storageBucket: "mess-db5a2.appspot.com",
    messagingSenderId: "125385749508",
    appId: "1:125385749508:web:f3e80ebb8cfd9e397af151",
    measurementId: "G-W6LN7XGMZB"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const storage = getStorage(app);

let currentUser = null;
let currentChatId = null;
let currentChatUser = null; // for groups: { isGroup:true, id:'group_x', data: groupData }
// 리스너 참조
let friendsRef = null;
let chatsRef = null;
let messagesRef = null;
let requestsRef = null;

// 금지 문자 안전 변환
function sanitizeKey(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/[.#$\[\]]/g, (c) => {
        return '%' + c.charCodeAt(0).toString(16);
    });
}

// ==================== 초기화 및 로그인 확인 ====================
function checkLoginStatus() {
    const savedUser = localStorage.getItem('chatAppUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainApp();
        loadUserData();
        loadFriends();
        loadChats();
        loadFriendRequests();
        updateUserStatus(true);
    } else {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginContainer').classList.add('active');
    document.getElementById('signupContainer').classList.remove('active');
    document.getElementById('mainApp').classList.remove('active');
}

function showMainApp() {
    document.getElementById('loginContainer').classList.remove('active');
    document.getElementById('signupContainer').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
}

// ==================== 회원가입 ====================
document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('signupUsername').value.trim().toLowerCase();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const name = document.getElementById('signupName').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const errorDiv = document.getElementById('signupError');
    const successDiv = document.getElementById('signupSuccess');
    const signupBtn = document.getElementById('signupBtn');
    
    errorDiv.classList.remove('show');
    successDiv.classList.remove('show');
    
    if (!/^[a-zA-Z0-9]+$/.test(username)) {
        errorDiv.textContent = '아이디는 영문과 숫자만 사용 가능합니다.';
        errorDiv.classList.add('show');
        return;
    }
    
    if (username.length < 4 || username.length > 20) {
        errorDiv.textContent = '아이디는 4-20자 사이여야 합니다.';
        errorDiv.classList.add('show');
        return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        errorDiv.textContent = '유효한 이메일을 입력하세요.';
        errorDiv.classList.add('show');
        return;
    }
    
    if (password !== passwordConfirm) {
        errorDiv.textContent = '비밀번호가 일치하지 않습니다.';
        errorDiv.classList.add('show');
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = '비밀번호는 6자 이상이어야 합니다.';
        errorDiv.classList.add('show');
        return;
    }
    
    signupBtn.disabled = true;
    signupBtn.innerHTML = '<span class="spinner"></span> 가입 중...';
    
    try {
        const userSnapshot = await get(ref(database, `usernames/${username}`));
        if (userSnapshot.exists()) {
            errorDiv.textContent = '이미 사용 중인 아이디입니다.';
            errorDiv.classList.add('show');
            return;
        }

        const emailKey = sanitizeKey(email);
        const emailSnapshot = await get(ref(database, `emails/${emailKey}`));
        if (emailSnapshot.exists()) {
            errorDiv.textContent = '이미 사용 중인 이메일입니다.';
            errorDiv.classList.add('show');
            return;
        }
        
        const userId = push(ref(database, 'users')).key;
        const hashedPassword = btoa(password);
        
        await set(ref(database, `users/${userId}`), {
            username: username,
            email: email,
            name: name,
            password: hashedPassword,
            status: '안녕하세요!',
            createdAt: Date.now(),
            online: false
        });
        
        await set(ref(database, `usernames/${username}`), userId);
        await set(ref(database, `emails/${emailKey}`), userId);
        
        successDiv.textContent = '회원가입이 완료되었습니다! 로그인해주세요.';
        successDiv.classList.add('show');
        
        document.getElementById('signupForm').reset();
        
        setTimeout(() => {
            document.getElementById('signupContainer').classList.remove('active');
            document.getElementById('loginContainer').classList.add('active');
        }, 2000);
        
    } catch (error) {
        console.error('회원가입 에러:', error);
        errorDiv.textContent = '회원가입 중 오류가 발생했습니다: ' + error.message;
        errorDiv.classList.add('show');
    } finally {
        signupBtn.disabled = false;
        signupBtn.textContent = '회원가입';
    }
});

// ==================== 로그인 ====================
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const identifier = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');
    
    errorDiv.classList.remove('show');
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> 로그인 중...';
    
    try {
        let userId = null;

        const usernameSnapshot = await get(ref(database, `usernames/${identifier}`));
        if (usernameSnapshot.exists()) {
            userId = usernameSnapshot.val();
        } else {
            const emailKey = sanitizeKey(identifier);
            const emailSnapshot = await get(ref(database, `emails/${emailKey}`));
            if (emailSnapshot.exists()) {
                userId = emailSnapshot.val();
            }
        }

        if (!userId) {
            errorDiv.textContent = '존재하지 않는 아이디 또는 이메일입니다.';
            errorDiv.classList.add('show');
            return;
        }
        
        const userSnapshot = await get(ref(database, `users/${userId}`));
        
        if (!userSnapshot.exists()) {
            errorDiv.textContent = '사용자 정보를 찾을 수 없습니다.';
            errorDiv.classList.add('show');
            return;
        }
        
        const userData = userSnapshot.val();
        const hashedPassword = btoa(password);
        
        if (userData.password !== hashedPassword) {
            errorDiv.textContent = '비밀번호가 올바르지 않습니다.';
            errorDiv.classList.add('show');
            return;
        }
        
        currentUser = {
            uid: userId,
            username: userData.username,
            name: userData.name,
            email: userData.email || '',
            status: userData.status
        };
        
        localStorage.setItem('chatAppUser', JSON.stringify(currentUser));
        await updateUserStatus(true);
        showMainApp();
        loadUserData();
        loadFriends();
        loadChats();
        loadFriendRequests();
        
    } catch (error) {
        console.error('로그인 에러:', error);
        errorDiv.textContent = '로그인 중 오류가 발생했습니다: ' + error.message;
        errorDiv.classList.add('show');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
    }
});

// ==================== 로그아웃 ====================
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
        try {
            await updateUserStatus(false);
            cleanupAllListeners();
            localStorage.removeItem('chatAppUser');
            currentUser = null;
            showLogin();
        } catch (error) {
            console.error('로그아웃 에러:', error);
            alert('로그아웃 중 오류가 발생했습니다.');
        }
    }
});

function loadUserData() {
    if (!currentUser) return;
    const profileEl = document.getElementById('userProfile');
    const label = currentUser.username ? currentUser.username.charAt(0).toUpperCase() : (currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U');
    profileEl.textContent = label;
}

async function updateUserStatus(online) {
    if (!currentUser) return;
    try {
        await update(ref(database, `users/${currentUser.uid}`), {
            online: online,
            lastSeen: Date.now()
        });
    } catch (error) {
        console.error('상태 업데이트 에러:', error);
    }
}

// ==================== 친구 요청 ====================
document.getElementById('addFriendBtn').addEventListener('click', async () => {
    const username = document.getElementById('friendUsername').value.trim().toLowerCase();
    const errorDiv = document.getElementById('addFriendError');
    const successDiv = document.getElementById('addFriendSuccess');
    const addBtn = document.getElementById('addFriendBtn');
    
    errorDiv.classList.remove('show');
    successDiv.classList.remove('show');
    
    if (!username) {
        errorDiv.textContent = '아이디를 입력해주세요.';
        errorDiv.classList.add('show');
        return;
    }
    
    if (username === currentUser.username) {
        errorDiv.textContent = '자기 자신에게 요청을 보낼 수 없습니다.';
        errorDiv.classList.add('show');
        return;
    }
    
    addBtn.disabled = true;
    addBtn.innerHTML = '<span class="spinner"></span> 요청 중...';
    
    try {
        const usernameSnapshot = await get(ref(database, `usernames/${username}`));
        
        if (!usernameSnapshot.exists()) {
            errorDiv.textContent = '해당 아이디의 사용자를 찾을 수 없습니다.';
            errorDiv.classList.add('show');
            return;
        }
        
        const friendId = usernameSnapshot.val();

        const friendCheck = await get(ref(database, `friends/${currentUser.uid}/${friendId}`));
        if (friendCheck.exists()) {
            errorDiv.textContent = '이미 친구로 등록되어 있습니다.';
            errorDiv.classList.add('show');
            return;
        }

        const existingRequest = await get(ref(database, `friendRequests/${friendId}/${currentUser.uid}`));
        if (existingRequest.exists()) {
            errorDiv.textContent = '이미 친구 요청을 보냈습니다.';
            errorDiv.classList.add('show');
            return;
        }

        await set(ref(database, `friendRequests/${friendId}/${currentUser.uid}`), {
            from: currentUser.uid,
            username: currentUser.username,
            name: currentUser.name || '',
            timestamp: Date.now(),
            status: 'pending'
        });

        successDiv.textContent = '친구 요청을 보냈습니다!';
        successDiv.classList.add('show');
        document.getElementById('friendUsername').value = '';

    } catch (error) {
        console.error('친구 요청 에러:', error);
        errorDiv.textContent = '친구 요청 중 오류가 발생했습니다: ' + error.message;
        errorDiv.classList.add('show');
    } finally {
        addBtn.disabled = false;
        addBtn.textContent = '친구 요청 보내기';
    }
});

// ==================== 친구 목록 로드 ====================
async function loadFriends() {
    if (!currentUser) return;
    if (friendsRef) { try { off(friendsRef); } catch (e) {} }

    friendsRef = ref(database, `friends/${currentUser.uid}`);
    onValue(friendsRef, async (snapshot) => {
        const friendsList = document.getElementById('friendsList');
        friendsList.innerHTML = '';
        
        if (!snapshot.exists()) {
            friendsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <h3>친구가 없습니다</h3>
                    <p>친구를 추가해보세요!</p>
                </div>
            `;
            renderGroupMemberList();
            return;
        }
        
        const friendIds = Object.keys(snapshot.val());
        
        for (const friendId of friendIds) {
            const userSnapshot = await get(ref(database, `users/${friendId}`));
            if (userSnapshot.exists()) {
                const friendData = userSnapshot.val();
                const initial = friendData.username ? friendData.username.charAt(0).toUpperCase() : '?';
                const onlineClass = friendData.online ? 'online' : '';
                
                const friendItem = document.createElement('div');
                friendItem.className = 'friend-item';
                friendItem.innerHTML = `
                    <div class="friend-avatar ${onlineClass}">${initial}</div>
                    <div class="friend-info">
                        <div class="friend-name">${friendData.name || '이름 없음'}</div>
                        <div class="friend-username">@${friendData.username}</div>
                        <div class="friend-status">${friendData.status || ''}</div>
                    </div>
                `;
                
                friendItem.addEventListener('click', () => {
                    openChat(friendId, friendData);
                });
                
                friendsList.appendChild(friendItem);
            }
        }
        renderGroupMemberList();
        renderGroupInviteCandidates();
    });
}

// ==================== 친구 요청 목록 로드 ====================
function loadFriendRequests() {
    if (!currentUser) return;
    if (requestsRef) { try { off(requestsRef); } catch (e) {} }

    requestsRef = ref(database, `friendRequests/${currentUser.uid}`);
    onValue(requestsRef, async (snapshot) => {
        const requestsList = document.getElementById('requestsList');
        const requestCountEl = document.getElementById('requestCount');
        requestsList.innerHTML = '';

        if (!snapshot.exists()) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📨</div>
                    <h3>친구 요청이 없습니다</h3>
                    <p>받은 요청이 표시됩니다</p>
                </div>
            `;
            requestCountEl.textContent = '';
            return;
        }

        const reqs = snapshot.val();
        const entries = Object.entries(reqs);
        requestCountEl.textContent = `(${entries.length})`;

        for (const [senderId, reqData] of entries) {
            const userSnap = await get(ref(database, `users/${senderId}`));
            const sender = userSnap.exists() ? userSnap.val() : {
                username: reqData.username || 'unknown',
                name: reqData.name || '이름 없음'
            };
            const initial = sender.username ? sender.username.charAt(0).toUpperCase() : '?';

            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div class="friend-avatar">${initial}</div>
                <div class="friend-info">
                    <div class="friend-name">${sender.name || '이름 없음'}</div>
                    <div class="friend-username">@${sender.username || ''}</div>
                    <div class="friend-status">요청 보냄 • ${new Date(reqData.timestamp || Date.now()).toLocaleString()}</div>
                </div>
                <div class="request-actions">
                    <button class="btn btn-secondary btn-reject" data-id="${senderId}">거절</button>
                    <button class="btn btn-primary btn-accept" data-id="${senderId}">수락</button>
                </div>
            `;

            item.querySelector('.btn-accept').addEventListener('click', async () => {
                await acceptFriendRequest(senderId);
            });
            item.querySelector('.btn-reject').addEventListener('click', async () => {
                await rejectFriendRequest(senderId);
            });

            requestsList.appendChild(item);
        }
    });
}

async function acceptFriendRequest(senderId) {
    if (!currentUser) return;
    try {
        await set(ref(database, `friends/${currentUser.uid}/${senderId}`), { addedAt: Date.now() });
        await set(ref(database, `friends/${senderId}/${currentUser.uid}`), { addedAt: Date.now() });
        await set(ref(database, `friendRequests/${currentUser.uid}/${senderId}`), null);
        alert('친구 요청을 수락했습니다.');
        loadFriends();
    } catch (err) {
        console.error('수락 에러:', err);
        alert('요청 수락 중 오류가 발생했습니다.');
    }
}

async function rejectFriendRequest(senderId) {
    if (!currentUser) return;
    try {
        await set(ref(database, `friendRequests/${currentUser.uid}/${senderId}`), null);
        alert('친구 요청을 거절했습니다.');
    } catch (err) {
        console.error('거절 에러:', err);
        alert('요청 거절 중 오류가 발생했습니다.');
    }
}

// ==================== 채팅 열기 ====================
async function openChat(peerId, peerData) {
    if (String(peerId).startsWith('group_')) {
        const groupId = peerId.split('group_')[1];
        const groupSnap = await get(ref(database, `groups/${groupId}`));
        if (!groupSnap.exists()) {
            alert('그룹 정보를 찾을 수 없습니다.');
            return;
        }
        const groupData = groupSnap.val();
        currentChatId = `group_${groupId}`;
        currentChatUser = { isGroup: true, id: currentChatId, data: groupData };
    } else {
        currentChatUser = { isGroup: false, id: peerId, data: peerData };
        currentChatId = [currentUser.uid, peerId].sort().join('_');
    }

    if (messagesRef) { try { off(messagesRef); } catch (e) {} messagesRef = null; }
    
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector('[data-view="messages"]').classList.add('active');
    
    document.getElementById('friendsPanel').classList.remove('active');
    document.getElementById('messagesPanel').classList.add('active');
    document.getElementById('chatArea').classList.add('active');
    
    let headerHtml = '';
    if (currentChatUser.isGroup) {
        const g = currentChatUser.data;
        const initials = g.name ? g.name.charAt(0).toUpperCase() : 'G';
        headerHtml = `
        <div class="chat-header">
            <div class="chat-header-left">
                <div class="chat-header-avatar">${initials}</div>
                <div class="chat-header-details">
                    <h3 id="groupNameHeader">${g.name || '그룹 채팅'}</h3>
                    <div class="chat-header-status" style="color: var(--text-secondary)">
                        멤버 ${g.members ? Object.keys(g.members).length : 0}명
                    </div>
                </div>
            </div>
            <div class="chat-actions">
                <button class="action-btn" id="emojiBtn" title="이모티콘">😊</button>
                <button class="action-btn" id="attachBtn" title="파일 첨부">📎</button>
                <button class="action-btn" title="그룹 정보" id="groupInfoBtn">ℹ️</button>
            </div>
        </div>`;
    } else {
        const friendData = currentChatUser.data;
        const initial = friendData.username ? friendData.username.charAt(0).toUpperCase() : '?';
        const onlineStatus = friendData.online ? '온라인' : '오프라인';
        const statusColor = friendData.online ? 'var(--success)' : 'var(--text-secondary)';
        headerHtml = `
        <div class="chat-header">
            <div class="chat-header-left">
                <div class="chat-header-avatar">${initial}</div>
                <div class="chat-header-details">
                    <h3>${friendData.name || '이름 없음'}</h3>
                    <div class="chat-header-status" style="color: ${statusColor}">
                        ${friendData.online ? '<span class="status-dot"></span>' : ''}
                        ${onlineStatus}
                    </div>
                </div>
            </div>
            <div class="chat-actions">
                <button class="action-btn" id="emojiBtn" title="이모티콘">😊</button>
                <button class="action-btn" id="attachBtn" title="파일 첨부">📎</button>
                <button class="action-btn" title="더보기">⋮</button>
            </div>
        </div>`;
    }

    document.getElementById('chatArea').innerHTML = `
        ${headerHtml}
        <div class="messages-container" id="messagesContainer"></div>
        <div class="input-area">
            <div class="input-wrapper">
                <div class="input-actions"></div>
                <textarea class="message-input" placeholder="메시지를 입력하세요..." rows="1" id="messageInput"></textarea>
                <button class="send-btn" id="sendBtn" title="전송">➤</button>
            </div>
        </div>
    `;
    
    if (currentChatUser.isGroup) {
        const groupId = currentChatId.split('group_')[1];
        const groupInfoBtn = document.getElementById('groupInfoBtn');
        groupInfoBtn?.addEventListener('click', async () => { openGroupInfo(groupId); });
        const groupNameHeader = document.getElementById('groupNameHeader');
        groupNameHeader?.addEventListener('click', () => { openGroupInfo(groupId); });
    }

    setupMessageInput();
    loadMessages();
    loadChatList();
    update(ref(database, `chats/${currentUser.uid}/${currentChatUser.id}`), { unread: false }).catch(()=>{});
}

function setupMessageInput() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const emojiBtn = document.getElementById('emojiBtn');
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    
    if (!messageInput || !sendBtn) return;
    
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    if (emojiBtn) {
        emojiBtn.addEventListener('click', (ev) => {
            const panel = document.getElementById('emojiPanel');
            if (!panel) return;
            panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
            document.getElementById('emojiSearch').value = '';
            renderEmojiPage();
        });
    }

    document.addEventListener('click', (ev) => {
        const panel = document.getElementById('emojiPanel');
        if (!panel) return;
        if (ev.target.closest('#emojiPanel') || ev.target.id === 'emojiBtn') return;
        panel.style.display = 'none';
    });

    if (attachBtn && fileInput) {
        attachBtn.addEventListener('click', () => {
            fileInput.value = '';
            fileInput.click();
        });

        fileInput.addEventListener('change', async (ev) => {
            const file = ev.target.files && ev.target.files[0];
            if (!file) return;
            if (!currentChatId || !currentChatUser) {
                alert('대화를 먼저 열어주세요.');
                return;
            }
            attachBtn.disabled = true;
            attachBtn.innerHTML = '<span class="spinner"></span>';

            try {
                const safeName = encodeURIComponent(file.name.replace(/\s+/g,'_'));
                const path = `uploads/${currentUser.uid}/${Date.now()}_${safeName}`;
                const sRef = storageRef(storage, path);
                await uploadBytes(sRef, file);
                const url = await getDownloadURL(sRef);

                const messagesRefLocal = ref(database, `messages/${currentChatId}`);
                const mRef = push(messagesRefLocal);
                await set(mRef, {
                    type: 'image',
                    imageUrl: url,
                    filename: file.name,
                    senderId: currentUser.uid,
                    senderUsername: currentUser.username,
                    timestamp: Date.now()
                });

                if (currentChatUser.isGroup) {
                    const groupId = currentChatId.split('group_')[1];
                    const groupSnap = await get(ref(database, `groups/${groupId}`));
                    const members = groupSnap.exists() ? groupSnap.val().members || {} : {};
                    for (const memberUid of Object.keys(members)) {
                        await update(ref(database, `chats/${memberUid}/${currentChatId}`), {
                            lastMessage: '[이미지]',
                            lastMessageTime: Date.now(),
                            unread: memberUid === currentUser.uid ? false : true
                        });
                    }
                } else {
                    await update(ref(database, `chats/${currentUser.uid}/${currentChatUser.id}`), {
                        lastMessage: '[이미지]',
                        lastMessageTime: Date.now(),
                        unread: false
                    });
                    await update(ref(database, `chats/${currentChatUser.id}/${currentUser.uid}`), {
                        lastMessage: '[이미지]',
                        lastMessageTime: Date.now(),
                        unread: true
                    });
                }
            } catch (err) {
                console.error('파일 업로드 오류', err);
                alert('파일 업로드 중 오류가 발생했습니다.');
            } finally {
                attachBtn.disabled = false;
                attachBtn.innerHTML = '📎';
            }
        });
    }
}

// ==================== 이모지 ====================
const EMOJIS = [
    "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","🙂","🙃","😋","😎","😍","😘","😗","😙","😚","😇",
    "🤩","🤗","🤔","🤨","😐","😑","😶","😏","😣","😥","😮","🤐","😯","😪","😫","😴","😌","😛","😜","😝",
    "🤤","😒","😓","😔","😕","🙁","☹️","😖","😞","😟","😤","😢","😭","😦","😧","😨","😩","🤯","😬","😰",
    "😱","🥵","🥶","😳","🤪","😵","😡","😠","🤬","😷","🤒","🤕","🤢","🤮","🤧","🥳","🥴","🤠","😺","😸",
    "😹","😻","😼","😽","🙀","😿","😾","👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙",
    "👈","👉","👆","👇","☝️","✋🏻","👏","🙌","👐","🤲","🙏","💪","🦾","🦵","🦿","🦶","👂","🦻","👃","🧠",
    "👀","👁️","👅","👄","💋","💌","💘","💝","💖","💗","💓","💞","💕","❣️","💔","❤️","🧡","💛","💚","💙",
    "💜","🖤","🤍","🤎","💯","💢","🔥","✨","⭐","🌟","🌞","🌝","🌚","🌛","🌜","🌈","☀️","⛅","☁️","🌧️",
    "⛈️","🌩️","🌨️","❄️","🌬️","💨","🌪️","🌫️","🌊","💧","💦","☔","⚡","☄️","🎃","🎄","🎉","🎊","🎁","🎈",
    "🔔","🎵","🎶","🎤","🎧","📯","🎷","🎸","🎹","🥁","📢","📣","🔊","🔔","🎯","🏆","🏅","🥇","🥈","🥉","⚽",
    "🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸","🥅","🏒","🏑","🏏","🥏","🥌","⛳","🏹","🎣","🧗","🏄","🏊",
    "🚗","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🚚","🚛","🚜","🛴","🚲","🛵","🏍️","✈️","🚀","🛸","⛵",
    "🛶","🚤","🛳️","⚓","⛽","🏁","🏳️","🏴","🏳️‍🌈","🇰🇷","🇺🇸","🇯🇵","🇨🇳","💬","📝","📌","📎","🔒","🔑","💡",
    "🔍","🧭","⏰","📅","📆","📱","💻","🖥️","🖨️","🎮","🧩","🪀","🪁","🔋","🔌","💸","💰","🧾","🔧","⚙️",
    "🧰","🛠️","🏥","🏫","🏦","🏨","🏪","🏠","🏡","🛏️","🛋️","🚪","🪑","🧴","🍏","🍎","🍐","🍊","🍋","🍌",
    "🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥒","🥬","🥕","🌽","🥔",
    "🍠","🥐","🍞","🥖","🧀","🥚","🍳","🥞","🧇","🍔","🍟","🍕","🌭","🥪","🌮","🌯","🥙","🍝","🍜","🍲",
    "🍣","🍱","🍛","🍤","🍙","🍚","🍘","🍥","🥠","🍢","🍡","🍧","🍨","🍦","🍰","🎂","🍮","🍩","🍪","🌰"
];

let emojiPage = 0;
const EMOJIS_PER_PAGE = 5;
let emojiFiltered = EMOJIS.slice();

function renderEmojiPage() {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;
    const start = emojiPage * EMOJIS_PER_PAGE;
    const pageEmojis = emojiFiltered.slice(start, start + EMOJIS_PER_PAGE);
    grid.innerHTML = '';
    if (pageEmojis.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;color:var(--text-secondary);text-align:center">검색 결과가 없습니다</div>';
        return;
    }
    pageEmojis.forEach(e => {
        const div = document.createElement('div');
        div.className = 'emoji-item';
        div.textContent = e;
        div.addEventListener('click', () => {
            insertEmoji(e);
            document.getElementById('emojiPanel').style.display = 'none';
            const ta = document.getElementById('messageInput');
            ta?.focus();
        });
        grid.appendChild(div);
    });
    document.getElementById('emojiPrev').disabled = emojiPage === 0;
    document.getElementById('emojiNext').disabled = (start + EMOJIS_PER_PAGE) >= emojiFiltered.length;
}

document.getElementById('emojiPrev').addEventListener('click', () => {
    if (emojiPage > 0) { emojiPage--; renderEmojiPage(); }
});
document.getElementById('emojiNext').addEventListener('click', () => {
    if ((emojiPage + 1) * EMOJIS_PER_PAGE < emojiFiltered.length) { emojiPage++; renderEmojiPage(); }
});

document.getElementById('emojiSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
        emojiFiltered = EMOJIS.slice();
    } else {
        emojiFiltered = EMOJIS.filter(em => em.includes(q) || em === q);
        if (emojiFiltered.length === 0) {
            const keywordMap = {
                heart: ['❤️','💖','💗','💓','💕','💝'],
                smile: ['😀','😃','😄','😁','🙂','😊'],
                sad: ['😢','😭','😞','😟','☹️'],
                fire: ['🔥'],
                party: ['🎉','🥳'],
                food: ['🍕','🍔','🍟','🍩','🍰','🍣','🍜'],
                cat: ['😺','😸','😹','😻','😼'],
                dog: ['🐶'],
                flag: ['🇰🇷','🇺🇸','🇯🇵','🇨🇳'],
                star: ['⭐','🌟'],
                music: ['🎵','🎶','🎧','🎤']
            };
            for (const k of Object.keys(keywordMap)) {
                if (k.startsWith(q)) { emojiFiltered = keywordMap[k]; break; }
            }
        }
    }
    emojiPage = 0;
    renderEmojiPage();
});
renderEmojiPage();

function insertEmoji(emoji) {
    const ta = document.getElementById('messageInput');
    if (!ta) return;
    const start = ta.selectionStart || ta.value.length;
    const end = ta.selectionEnd || start;
    ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + emoji.length;
    ta.dispatchEvent(new Event('input'));
}

// ==================== 메시지 전송 ====================
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput || !currentChatId) return;
    
    const text = messageInput.value.trim();
    if (text === '') return;
    
    try {
        const messagesRefLocal = ref(database, `messages/${currentChatId}`);
        const mRef = push(messagesRefLocal);
        await set(mRef, {
            type: 'text',
            text: text,
            senderId: currentUser.uid,
            senderUsername: currentUser.username,
            timestamp: Date.now()
        });

        if (currentChatUser.isGroup) {
            const groupId = currentChatId.split('group_')[1];
            const groupSnap = await get(ref(database, `groups/${groupId}`));
            const members = groupSnap.exists() ? groupSnap.val().members || {} : {};
            for (const memberUid of Object.keys(members)) {
                await update(ref(database, `chats/${memberUid}/${currentChatId}`), {
                    lastMessage: text,
                    lastMessageTime: Date.now(),
                    unread: memberUid === currentUser.uid ? false : true
                });
            }
        } else {
            await update(ref(database, `chats/${currentUser.uid}/${currentChatUser.id}`), {
                lastMessage: text,
                lastMessageTime: Date.now(),
                unread: false
            });
            await update(ref(database, `chats/${currentChatUser.id}/${currentUser.uid}`), {
                lastMessage: text,
                lastMessageTime: Date.now(),
                unread: true
            });
        }
        
        messageInput.value = '';
        messageInput.style.height = 'auto';
    } catch (error) {
        console.error('메시지 전송 에러:', error);
        alert('메시지 전송에 실패했습니다: ' + error.message);
    }
}

// ==================== 메시지 로드 ====================
async function loadMessages() {
    if (!currentChatId) return;
    if (messagesRef) { try { off(messagesRef); } catch (e) {} }

    messagesRef = ref(database, `messages/${currentChatId}`);
    onValue(messagesRef, async (snapshot) => {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        
        messagesContainer.innerHTML = '';
        if (!snapshot.exists()) {
            messagesContainer.innerHTML = `<div class="date-divider"><span>대화 시작</span></div>`;
            return;
        }
        
        let lastDate = null;
        const messages = [];
        snapshot.forEach((childSnapshot) => {
            messages.push({ id: childSnapshot.key, ...childSnapshot.val() });
        });
        messages.sort((a, b) => a.timestamp - b.timestamp);

        for (const message of messages) {
            const messageDate = new Date(message.timestamp);
            const dateStr = messageDate.toLocaleDateString('ko-KR');
            
            if (dateStr !== lastDate) {
                const divider = document.createElement('div');
                divider.className = 'date-divider';
                divider.innerHTML = `<span>${dateStr}</span>`;
                messagesContainer.appendChild(divider);
                lastDate = dateStr;
            }
            
            const isSent = message.senderId === currentUser.uid;
            const timeStr = messageDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            
            let initial;
            if (isSent) {
                initial = currentUser.username ? currentUser.username.charAt(0).toUpperCase() : 'U';
            } else {
                if (currentChatUser.isGroup) {
                    const senderSnap = await get(ref(database, `users/${message.senderId}`));
                    const s = senderSnap.exists() ? senderSnap.val() : { username: message.senderUsername || 'U', name: message.senderUsername || '' };
                    initial = s.username ? s.username.charAt(0).toUpperCase() : '?';
                } else {
                    initial = currentChatUser && currentChatUser.data.username ? currentChatUser.data.username.charAt(0).toUpperCase() : '?';
                }
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
            
            let bubbleContent = '';
            if (message.type === 'image' && message.imageUrl) {
                bubbleContent = `<img src="${escapeHtml(message.imageUrl)}" class="message-image" alt="${escapeHtml(message.filename || 'image')}" />`;
            } else {
                bubbleContent = escapeHtml(message.text || '');
            }

            let senderNameHtml = '';
            if (currentChatUser.isGroup && !isSent) {
                const senderSnap = await get(ref(database, `users/${message.senderId}`));
                const s = senderSnap.exists() ? senderSnap.val() : { username: message.senderUsername || 'unknown', name: message.senderUsername || '' };
                senderNameHtml = `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${s.name || s.username || '이름 없음'}</div>`;
            }

            let readHtml = '';
            if (isSent) {
                const readBy = message.readBy || {};
                if (currentChatUser.isGroup) {
                    const groupId = currentChatId.split('group_')[1];
                    const groupSnap = await get(ref(database, `groups/${groupId}`));
                    const members = groupSnap.exists() ? groupSnap.val().members || {} : {};
                    const total = Object.keys(members).length;
                    const readCount = Object.keys(readBy).filter(k=>readBy[k]).length;
                    readHtml = `<div class="read-indicator">${readCount}/${total} 읽음</div>`;
                } else {
                    const readByFriend = message.readBy && message.readBy[currentChatUser.id];
                    readHtml = `<div class="read-indicator">${readByFriend ? '읽음' : ''}</div>`;
                }
            }

            messageDiv.innerHTML = `
                <div class="message-avatar">${initial}</div>
                <div class="message-content">
                    ${senderNameHtml}
                    <div class="message-bubble">${bubbleContent}</div>
                    <div class="message-time">${timeStr}</div>
                    ${readHtml}
                </div>
            `;
            messagesContainer.appendChild(messageDiv);
        }
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        for (const message of messages) {
            if (message.senderId !== currentUser.uid) {
                const alreadyRead = message.readBy && message.readBy[currentUser.uid];
                if (!alreadyRead) {
                    try { await set(ref(database, `messages/${currentChatId}/${message.id}/readBy/${currentUser.uid}`), true); } catch (e) {}
                }
            }
        }
        try { await update(ref(database, `chats/${currentUser.uid}/${currentChatUser.id}`), { unread: false }); } catch(e) {}
    });
}

// ==================== 채팅 목록 로드 ====================
function loadChatList() {
    if (!currentUser) return;
    if (chatsRef) { try { off(chatsRef); } catch (e) {} }

    chatsRef = ref(database, `chats/${currentUser.uid}`);
    onValue(chatsRef, async (snapshot) => {
        const chatList = document.getElementById('chatList');
        if (!chatList) return;
        
        chatList.innerHTML = '';
        if (!snapshot.exists()) {
            chatList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3>메시지가 없습니다</h3>
                    <p>친구에게 메시지를 보내보세요!</p>
                </div>
            `;
            return;
        }
        
        const chats = [];
        for (const [peerKey, chatData] of Object.entries(snapshot.val())) {
            if (peerKey.startsWith('group_')) {
                const groupId = peerKey.split('group_')[1];
                const gSnap = await get(ref(database, `groups/${groupId}`));
                if (gSnap.exists()) {
                    chats.push({
                        friendId: peerKey,
                        friendData: { name: gSnap.val().name || '그룹', isGroup:true },
                        chatData
                    });
                }
            } else {
                const userSnapshot = await get(ref(database, `users/${peerKey}`));
                if (userSnapshot.exists()) {
                    chats.push({
                        friendId: peerKey,
                        friendData: userSnapshot.val(),
                        chatData
                    });
                }
            }
        }
        
        chats.sort((a, b) => (b.chatData.lastMessageTime || 0) - (a.chatData.lastMessageTime || 0));
        let unreadCount = 0;
        
        for (const chat of chats) {
            const initial = chat.friendData.name ? chat.friendData.name.charAt(0).toUpperCase() : (chat.friendData.username ? chat.friendData.username.charAt(0).toUpperCase() : '?');
            const time = chat.chatData.lastMessageTime ? new Date(chat.chatData.lastMessageTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
            if (chat.chatData.unread) unreadCount++;
            
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            chatItem.innerHTML = `
                <div class="chat-avatar">${initial}</div>
                <div class="chat-info">
                    <div class="chat-header-info">
                        <div class="chat-name">${chat.friendData.name || '이름 없음'}</div>
                        <div class="chat-time">${time}</div>
                    </div>
                    <div class="chat-preview">${chat.chatData.lastMessage || ''}</div>
                </div>
                ${chat.chatData.unread ? '<span class="unread-badge">N</span>' : ''}
            `;
            
            chatItem.addEventListener('click', () => {
                openChat(chat.friendId, chat.friendData);
                if (chat.chatData.unread) {
                    update(ref(database, `chats/${currentUser.uid}/${chat.friendId}`), { unread: false });
                }
            });
            chatList.appendChild(chatItem);
        }
        
        const badge = document.getElementById('unreadBadge');
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    });
}
function loadChats() { loadChatList(); }

function escapeHtml(text) {
    if (!text) return '';
    const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ==================== UI 이벤트 ====================
document.getElementById('showSignup').addEventListener('click', () => {
    document.getElementById('loginContainer').classList.remove('active');
    document.getElementById('signupContainer').classList.add('active');
});

document.getElementById('backToLogin').addEventListener('click', () => {
    document.getElementById('signupContainer').classList.remove('active');
    document.getElementById('loginContainer').classList.add('active');
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const view = item.dataset.view;
        if (view === 'friends') {
            document.getElementById('friendsPanel').classList.add('active');
            document.getElementById('messagesPanel').classList.remove('active');
            document.getElementById('chatArea').classList.remove('active');
        } else if (view === 'messages') {
            document.getElementById('friendsPanel').classList.remove('active');
            document.getElementById('messagesPanel').classList.add('active');
            if (currentChatId) {
                document.getElementById('chatArea').classList.add('active');
            }
        }
    });
});

document.querySelectorAll('#friendsTabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#friendsTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        if (tab === 'friends-list') {
            document.getElementById('friendsList').style.display = 'block';
            document.getElementById('friendRequests').style.display = 'none';
            document.getElementById('addFriend').style.display = 'none';
        } else if (tab === 'add-friend') {
            document.getElementById('friendsList').style.display = 'none';
            document.getElementById('friendRequests').style.display = 'none';
            document.getElementById('addFriend').style.display = 'block';
        } else if (tab === 'requests') {
            document.getElementById('friendsList').style.display = 'none';
            document.getElementById('friendRequests').style.display = 'block';
            document.getElementById('addFriend').style.display = 'none';
        }
    });
});

// ==================== 그룹 관련 로직 ====================
const groupModal = document.getElementById('groupModal');
document.getElementById('createGroupBtn').addEventListener('click', async () => {
    if (!currentUser) { alert('로그인 상태가 필요합니다.'); return; }
    renderGroupMemberList();
    document.getElementById('groupName').value = '';
    document.getElementById('groupError').classList.remove('show');
    groupModal.classList.add('active');
});
document.getElementById('cancelGroupBtn').addEventListener('click', () => {
    groupModal.classList.remove('active');
});

async function renderGroupMemberList() {
    const listEl = document.getElementById('groupMemberList');
    if (!listEl) return;
    listEl.innerHTML = '<div style="color:var(--text-secondary)">불러오는 중...</div>';
    try {
        const friendsSnap = await get(ref(database, `friends/${currentUser.uid}`));
        if (!friendsSnap.exists()) {
            listEl.innerHTML = '<div style="color:var(--text-secondary)">친구가 없습니다</div>';
            return;
        }
        const members = Object.keys(friendsSnap.val());
        if (members.length === 0) {
            listEl.innerHTML = '<div style="color:var(--text-secondary)">친구가 없습니다</div>';
            return;
        }
        listEl.innerHTML = '';
        for (const fid of members) {
            const uSnap = await get(ref(database, `users/${fid}`));
            if (!uSnap.exists()) continue;
            const u = uSnap.val();
            const div = document.createElement('div');
            div.className = 'member-item';
            div.innerHTML = `
                <input type="checkbox" data-uid="${fid}" id="chk_${fid}" />
                <label for="chk_${fid}" style="cursor:pointer">${u.name || u.username || fid} (@${u.username || ''})</label>
            `;
            listEl.appendChild(div);
        }
    } catch (e) {
        console.error('그룹 멤버 목록 로드 오류', e);
        listEl.innerHTML = '<div style="color:var(--text-secondary)">목록 로드 실패</div>';
    }
}

document.getElementById('confirmCreateGroup').addEventListener('click', async () => {
    const err = document.getElementById('groupError');
    err.classList.remove('show');
    const groupName = document.getElementById('groupName').value.trim();
    const listEl = document.getElementById('groupMemberList');
    if (!groupName) {
        err.textContent = '그룹 이름을 입력하세요.';
        err.classList.add('show');
        return;
    }
    const checks = listEl.querySelectorAll('input[type="checkbox"]:checked');
    if (!checks.length) {
        err.textContent = '최소 한 명의 멤버를 선택하세요.';
        err.classList.add('show');
        return;
    }
    const memberUids = Array.from(checks).map(c=>c.dataset.uid);
    if (!memberUids.includes(currentUser.uid)) memberUids.push(currentUser.uid);

    try {
        const groupId = push(ref(database, 'groups')).key;
        const membersObj = {};
        for (const uid of memberUids) {
            const uSnap = await get(ref(database, `users/${uid}`));
            membersObj[uid] = uSnap.exists() ? { username: uSnap.val().username, name: uSnap.val().name } : { uid };
        }
        await set(ref(database, `groups/${groupId}`), {
            name: groupName,
            members: membersObj,
            createdAt: Date.now(),
            creator: currentUser.uid
        });

        const chatKey = `group_${groupId}`;
        for (const uid of memberUids) {
            await set(ref(database, `chats/${uid}/${chatKey}`), {
                lastMessage: `${currentUser.name || currentUser.username}님이 그룹을 만들었습니다.`,
                lastMessageTime: Date.now(),
                unread: uid === currentUser.uid ? false : true
            });
        }
        groupModal.classList.remove('active');
        loadChatList();
        alert('그룹이 생성되었습니다.');
    } catch (e) {
        console.error('그룹 생성 오류', e);
        err.textContent = '그룹 생성 실패: ' + e.message;
        err.classList.add('show');
    }
});

const groupInfoModal = document.getElementById('groupInfoModal');
const groupMembersList = document.getElementById('groupMembersList');
const groupInviteList = document.getElementById('groupInviteList');
const groupInfoTitle = document.getElementById('groupInfoTitle');
const groupInfoError = document.getElementById('groupInfoError');

document.getElementById('closeGroupInfo').addEventListener('click', () => {
    groupInfoModal.classList.remove('active');
});

async function openGroupInfo(groupId) {
    groupInfoError.classList.remove('show');
    groupMembersList.innerHTML = '<div style="color:var(--text-secondary)">불러오는 중...</div>';
    groupInviteList.innerHTML = '<div style="color:var(--text-secondary)">불러오는 중...</div>';
    try {
        const gSnap = await get(ref(database, `groups/${groupId}`));
        if (!gSnap.exists()) {
            alert('그룹 정보를 찾을 수 없습니다.');
            return;
        }
        const g = gSnap.val();
        groupInfoTitle.textContent = `그룹: ${g.name || '이름 없음'}`;
        const members = g.members || {};
        groupMembersList.innerHTML = '';
        const isCreator = g.creator === currentUser.uid;
        for (const uid of Object.keys(members)) {
            const uSnap = await get(ref(database, `users/${uid}`));
            const u = uSnap.exists() ? uSnap.val() : (members[uid] || { username: uid, name: uid });
            const div = document.createElement('div');
            div.className = 'group-member';
            div.innerHTML = `
                <div class="info">
                    <div class="avatar">${u.username ? u.username.charAt(0).toUpperCase() : 'U'}</div>
                    <div>
                        <div style="font-weight:700">${u.name || u.username || uid}</div>
                        <div style="font-size:12px;color:var(--text-secondary)">@${u.username || uid}</div>
                    </div>
                </div>
                <div>
                    ${g.creator === uid ? '<span style="font-size:12px;color:var(--text-secondary);margin-right:8px;">관리자</span>' : ''}
                    ${ (isCreator && uid !== currentUser.uid) ? `<button class="btn btn-secondary btn-remove" data-uid="${uid}">추방</button>` : '' }
                </div>
            `;
            groupMembersList.appendChild(div);
        }

        groupMembersList.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', async (ev) => {
                const targetUid = btn.dataset.uid;
                if (!confirm('정말로 멤버를 추방하시겠습니까?')) return;
                try {
                    await set(ref(database, `groups/${groupId}/members/${targetUid}`), null);
                    await set(ref(database, `chats/${targetUid}/group_${groupId}`), null);
                    const mRef = push(ref(database, `messages/group_${groupId}`));
                    await set(mRef, {
                        type: 'system',
                        text: `${targetUid}님이 그룹에서 추방되었습니다.`,
                        timestamp: Date.now(),
                        senderId: currentUser.uid
                    });
                    openGroupInfo(groupId);
                    if (currentChatId === `group_${groupId}`) {
                        const g2 = (await get(ref(database, `groups/${groupId}`))).val();
                        currentChatUser.data = g2;
                        const headerStatus = document.querySelector('.chat-header-status');
                        if (headerStatus) headerStatus.textContent = `멤버 ${g2.members ? Object.keys(g2.members).length : 0}명`;
                    }
                } catch (err) {
                    console.error('멤버 추방 오류', err);
                    groupInfoError.textContent = '추방 실패: ' + err.message;
                    groupInfoError.classList.add('show');
                }
            });
        });

        await renderGroupInviteCandidates(groupId);
        groupInfoModal.classList.add('active');
    } catch (e) {
        console.error('그룹 정보 로드 오류', e);
        alert('그룹 정보를 불러오는 중 오류가 발생했습니다.');
    }
}

async function renderGroupInviteCandidates(groupId) {
    groupInviteList.innerHTML = '<div style="color:var(--text-secondary)">불러오는 중...</div>';
    try {
        const friendsSnap = await get(ref(database, `friends/${currentUser.uid}`));
        const gSnap = await get(ref(database, `groups/${groupId}`));
        if (!friendsSnap.exists()) {
            groupInviteList.innerHTML = '<div style="color:var(--text-secondary)">초대할 친구가 없습니다</div>';
            return;
        }
        const friends = Object.keys(friendsSnap.val());
        const members = gSnap.exists() ? (gSnap.val().members || {}) : {};
        const candidates = friends.filter(f => !members[f]);
        if (candidates.length === 0) {
            groupInviteList.innerHTML = '<div style="color:var(--text-secondary)">초대할 친구가 없습니다</div>';
            return;
        }
        groupInviteList.innerHTML = '';
        for (const fid of candidates) {
            const uSnap = await get(ref(database, `users/${fid}`));
            if (!uSnap.exists()) continue;
            const u = uSnap.val();
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'space-between';
            div.style.padding = '6px';
            div.style.borderRadius = '6px';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--primary),var(--secondary));color:white;font-weight:700;">${u.username?u.username.charAt(0).toUpperCase():'U'}</div>
                    <div>
                        <div style="font-weight:600">${u.name || u.username}</div>
                        <div style="font-size:12px;color:var(--text-secondary)">@${u.username}</div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-primary btn-invite" data-uid="${fid}" data-group="${groupId}">초대</button>
                </div>
            `;
            groupInviteList.appendChild(div);
        }

        groupInviteList.querySelectorAll('.btn-invite').forEach(btn => {
            btn.addEventListener('click', async () => {
                const fid = btn.dataset.uid;
                const gid = btn.dataset.group;
                try {
                    const uSnap = await get(ref(database, `users/${fid}`));
                    const u = uSnap.exists() ? uSnap.val() : { username: fid, name: fid };
                    await set(ref(database, `groups/${gid}/members/${fid}`), { username: u.username, name: u.name });
                    await set(ref(database, `chats/${fid}/group_${gid}`), {
                        lastMessage: `${currentUser.name || currentUser.username}님이 초대했습니다.`,
                        lastMessageTime: Date.now(),
                        unread: true
                    });
                    const mRef = push(ref(database, `messages/group_${gid}`));
                    await set(mRef, {
                        type: 'system',
                        text: `${u.name || u.username}님이 그룹에 초대되었습니다.`,
                        timestamp: Date.now(),
                        senderId: currentUser.uid
                    });
                    renderGroupInviteCandidates(gid);
                    openGroupInfo(gid);
                } catch (err) {
                    console.error('초대 실패', err);
                    groupInfoError.textContent = '초대 실패: ' + err.message;
                    groupInfoError.classList.add('show');
                }
            });
        });
    } catch (e) {
        console.error('초대 후보 로드 실패', e);
        groupInviteList.innerHTML = '<div style="color:var(--text-secondary)">로딩 실패</div>';
    }
}

window.addEventListener('beforeunload', () => {
    if (currentUser) updateUserStatus(false);
    cleanupAllListeners();
});

function cleanupAllListeners() {
    try { if (friendsRef) off(friendsRef); } catch(e) {}
    try { if (chatsRef) off(chatsRef); } catch(e) {}
    try { if (messagesRef) off(messagesRef); } catch(e) {}
    try { if (requestsRef) off(requestsRef); } catch(e) {}
    friendsRef = null; chatsRef = null; messagesRef = null; requestsRef = null;
}

// ==================== 설정 ====================
const settingsModalEl = document.getElementById('settingsModal');
document.getElementById('openSettings').addEventListener('click', openSettings);
document.getElementById('userProfile').addEventListener('click', openSettings);
document.getElementById('closeSettings').addEventListener('click', () => { settingsModalEl.classList.remove('active'); });

function openSettings() {
    if (!currentUser) return;
    document.getElementById('settingsName').value = currentUser.name || '';
    document.getElementById('settingsStatus').value = currentUser.status || '';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    document.getElementById('settingsError').classList.remove('show');
    document.getElementById('settingsSuccess').classList.remove('show');
    settingsModalEl.classList.add('active');
}

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    if (!currentUser) return;
    const name = document.getElementById('settingsName').value.trim();
    const status = document.getElementById('settingsStatus').value.trim();
    const currentPwd = document.getElementById('currentPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmNew = document.getElementById('confirmNewPassword').value;
    const err = document.getElementById('settingsError');
    const ok = document.getElementById('settingsSuccess');

    err.classList.remove('show');
    ok.classList.remove('show');

    try {
        await update(ref(database, `users/${currentUser.uid}`), { name: name, status: status });
        currentUser.name = name;
        currentUser.status = status;
        localStorage.setItem('chatAppUser', JSON.stringify(currentUser));
        loadUserData();
        loadFriends();

        if (newPwd || confirmNew || currentPwd) {
            if (!currentPwd) { err.textContent = '현재 비밀번호를 입력하세요.'; err.classList.add('show'); return; }
            if (newPwd.length < 6) { err.textContent = '새 비밀번호는 6자 이상이어야 합니다.'; err.classList.add('show'); return; }
            if (newPwd !== confirmNew) { err.textContent = '새 비밀번호와 확인값이 일치하지 않습니다.'; err.classList.add('show'); return; }

            const userSnap = await get(ref(database, `users/${currentUser.uid}`));
            const userData = userSnap.val();
            const hashedCurrent = btoa(currentPwd);
            if (userData.password !== hashedCurrent) {
                err.textContent = '현재 비밀번호가 올바르지 않습니다.';
                err.classList.add('show');
                return;
            }
            const hashedNew = btoa(newPwd);
            await update(ref(database, `users/${currentUser.uid}`), { password: hashedNew });
            ok.textContent = '계정 정보와 비밀번호가 업데이트되었습니다.';
        } else {
            ok.textContent = '계정 정보가 업데이트되었습니다.';
        }
        ok.classList.add('show');
    } catch (error) {
        console.error('설정 저장 에러:', error);
        err.textContent = '설정 저장 중 오류가 발생했습니다: ' + error.message;
        err.classList.add('show');
    }
});

settingsModalEl.addEventListener('click', (e) => { if (e.target === settingsModalEl) settingsModalEl.classList.remove('active'); });
groupModal.addEventListener('click', (e) => { if (e.target === groupModal) groupModal.classList.remove('active'); });
groupInfoModal.addEventListener('click', (e) => { if (e.target === groupInfoModal) groupInfoModal.classList.remove('active'); });

checkLoginStatus();
