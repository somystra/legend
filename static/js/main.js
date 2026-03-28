document.addEventListener('DOMContentLoaded', () => {
    // 1. FIREBASE ULASH
    const db = firebase.database();
    const auth = firebase.auth();
    const storage = firebase.storage();
    let currentUser = null;

    // 2. DOM ELEMENTLAR
    const authWall = document.getElementById('auth-wall');
    const mainApp = document.getElementById('main-app');
    const postsStream = document.getElementById('posts-stream');
    const modalCompose = document.getElementById('modal-compose');

    // 3. TIZIMGA KIRISH (Google Auth)
    document.getElementById('btn-login').addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).then(res => {
            db.ref('users/' + res.user.uid).once('value', snap => {
                if(snap.exists()) {
                    currentUser = snap.val();
                    bootOS();
                } else {
                    document.getElementById('btn-login').style.display = 'none';
                    document.getElementById('setup-profile').style.display = 'block';
                }
            });
        }).catch(err => alert("Xatolik: " + err.message));
    });

    // Profilni saqlash
    document.getElementById('btn-finish-setup').addEventListener('click', () => {
        const user = auth.currentUser;
        const uname = document.getElementById('input-username').value.trim();
        if(!uname) return alert("@username majburiy!");
        
        currentUser = {
            uid: user.uid,
            username: uname.startsWith('@') ? uname : '@' + uname,
            avatar: user.photoURL,
            role: 'user'
        };
        db.ref('users/' + user.uid).set(currentUser).then(bootOS);
    });

    // 4. OS NI ISHGA TUSHIRISH
    function bootOS() {
        authWall.style.display = 'none';
        mainApp.style.display = 'flex';
        
        // Profil ma'lumotlarini qo'yish
        document.getElementById('my-avatar').src = currentUser.avatar;
        document.getElementById('my-username').innerText = currentUser.username;
        
        loadPosts();
    }

    // 5. POST YUKLASH MODALI
    document.getElementById('btn-create-post').addEventListener('click', () => modalCompose.style.display = 'flex');
    document.getElementById('btn-close-modal').addEventListener('click', () => modalCompose.style.display = 'none');

    // Fayl tanlanganda ko'rsatish
    let selectedFile = null;
    document.getElementById('post-file').addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        if(selectedFile) alert("Fayl biriktirildi: " + selectedFile.name);
    });

    // 6. POSTNI BAZAGA YUBORISH
    document.getElementById('btn-publish').addEventListener('click', async () => {
        const text = document.getElementById('post-text').value.trim();
        const btn = document.getElementById('btn-publish');
        
        if(!text && !selectedFile) return alert("Matn yoki rasm kiriting!");
        
        btn.innerText = "Yuklanmoqda...";
        btn.disabled = true;

        let mediaUrl = "";
        let mediaType = "text";

        try {
            if(selectedFile) {
                const ref = storage.ref(`posts/${Date.now()}_${selectedFile.name}`);
                await ref.put(selectedFile);
                mediaUrl = await ref.getDownloadURL();
                mediaType = selectedFile.type.startsWith('video/') ? 'vid' : 'img';
            }

            await db.ref('posts').push({
                uid: currentUser.uid,
                username: currentUser.username,
                avatar: currentUser.avatar,
                text: text,
                mediaUrl: mediaUrl,
                mediaType: mediaType,
                likes: 0,
                timestamp: Date.now()
            });

            modalCompose.style.display = 'none';
            document.getElementById('post-text').value = '';
            selectedFile = null;
            btn.innerText = "Ulashish";
            btn.disabled = false;

        } catch (err) {
            alert("Xatolik: " + err.message);
            btn.innerText = "Ulashish";
            btn.disabled = false;
        }
    });

    // 7. POSTLARNI LENTAGA CHIQARISH (Real-time)
    function loadPosts() {
        postsStream.innerHTML = '';
        db.ref('posts').orderByChild('timestamp').on('child_added', snap => {
            const p = snap.val();
            const postId = snap.key;
            
            let mediaHtml = '';
            if(p.mediaType === 'img') mediaHtml = `<div class="post-media"><img src="${p.mediaUrl}"></div>`;
            if(p.mediaType === 'vid') mediaHtml = `<div class="post-media"><video controls src="${p.mediaUrl}"></video></div>`;

            // O'chirish tugmasi faqat post egasiga ko'rinadi
            const deleteBtn = p.uid === currentUser.uid ? `<i class="fas fa-trash-alt btn-delete" data-id="${postId}" style="margin-left:auto; font-size:14px; color:#8b949e;"></i>` : '';

            const postHTML = `
                <div class="post-card" id="post-${postId}">
                    <div class="post-header">
                        <img src="${p.avatar}">
                        <b>${p.username}</b>
                        ${deleteBtn}
                    </div>
                    ${mediaHtml}
                    <div class="post-actions">
                        <i class="far fa-heart btn-like" data-id="${postId}"></i>
                        <i class="far fa-comment"></i>
                        <i class="far fa-paper-plane"></i>
                    </div>
                    <div class="post-likes" id="likes-${postId}">${p.likes || 0} ta belgi</div>
                    <div class="post-caption"><b>${p.username}</b> ${p.text}</div>
                </div>
            `;
            postsStream.insertAdjacentHTML('afterbegin', postHTML);
        });

        // Agar kimgadir post yoqmasa o'chib ketadi
        db.ref('posts').on('child_removed', snap => {
            const el = document.getElementById('post-' + snap.key);
            if(el) el.remove();
        });
    }

    // 8. GLOBAL EVENT DELEGATION (Like va O'chirish tugmalari har doim ishlaydi)
    postsStream.addEventListener('click', (e) => {
        
        // LIKE BOSILGANDA
        if(e.target.classList.contains('btn-like')) {
            const postId = e.target.getAttribute('data-id');
            const isLiked = e.target.classList.contains('fas'); // fas = qizil yurak
            
            if(isLiked) {
                e.target.classList.replace('fas', 'far');
                e.target.style.color = '';
                // Aslida bu yerda bazadagi laykni -1 qilish kerak
            } else {
                e.target.classList.replace('far', 'fas');
                e.target.style.color = '#ed4956';
                
                // Bazadagi laykni +1 qilish
                const likeRef = db.ref(`posts/${postId}/likes`);
                likeRef.transaction(currentLikes => (currentLikes || 0) + 1);
                
                // Ekranda darhol yangilash
                const likesEl = document.getElementById(`likes-${postId}`);
                likesEl.innerText = parseInt(likesEl.innerText) + 1 + " ta belgi";
            }
        }

        // POSTNI O'CHIRISH BOSILGANDA
        if(e.target.classList.contains('btn-delete')) {
            if(confirm("Post o'chirilsinmi?")) {
                const postId = e.target.getAttribute('data-id');
                db.ref(`posts/${postId}`).remove();
            }
        }
    });
});
