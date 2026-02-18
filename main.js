// main.js
const db = firebase.firestore();
const storage = firebase.storage();

document.addEventListener('DOMContentLoaded', async () => {
    let topics = [];
    let currentTopic = null;
    let postListenerUnsubscribe = null;
    let recaptchaWidgetId = null;

    // --- User Identification (Simple localStorage-based ID) ---
    let userId = localStorage.getItem('shongshong_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('shongshong_user_id', userId);
    }

    // --- DOM Elements ---
    const topicsContainer = document.getElementById('topics-container');
    const newTopicInput = document.getElementById('new-topic-input');
    const addTopicButton = document.getElementById('add-topic-button');
    const currentTopicNameDisplay = document.getElementById('current-topic-name');
    const topicPostFormContainer = document.getElementById('topic-post-form-container');
    const activePostsContainer = document.getElementById('active-posts-container');
    const globalRecaptchaContainer = document.getElementById('global-recaptcha-container');

    let isRecaptchaVisible = false;

    // --- Helper Functions ---
    async function initializeAndMigrateTopics() {
        try {
            const topicsRef = db.collection('topics');
            const snapshot = await topicsRef.get();
            
            if (snapshot.empty) {
                console.log("No topics found. Creating initial topics.");
                const initialTopics = ['General', 'Business', 'Love', 'Travel', 'Future'];
                for (const name of initialTopics) {
                    await topicsRef.add({ name, createdAt: firebase.firestore.Timestamp.now() });
                }
            } else {
                // Migration: Rename M&A to Business, JBOD to Love
                const migrationMap = { 'M&A': 'Business', 'JBOD': 'Love' };
                const existingNames = snapshot.docs.map(doc => doc.data().name);
                
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    if (migrationMap[data.name]) {
                        await doc.ref.update({ name: migrationMap[data.name] });
                        console.log(`Renamed topic ${data.name} to ${migrationMap[data.name]}`);
                    }
                }

                // Add missing topics: Travel, Future
                const requiredTopics = ['Travel', 'Future'];
                for (const name of requiredTopics) {
                    if (!existingNames.includes(name)) {
                        await topicsRef.add({ name, createdAt: firebase.firestore.Timestamp.now() });
                        console.log(`Added missing topic: ${name}`);
                    }
                }
            }
        } catch (error) {
            console.error("Firebase topic init/migration error:", error);
        }
    }

    function renderPosts(posts) {
        activePostsContainer.innerHTML = '';
        if (posts.length === 0) {
            activePostsContainer.innerHTML = '<p style="text-align:center; padding: 20px;">No posts in this topic yet. Be the first to post!</p>';
            return;
        }

        posts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.classList.add('post');

            const postMeta = document.createElement('div');
            postMeta.classList.add('post-meta');
            let verificationText = post.verification ? ` (${post.verification.replace(/_/g, ' ')})` : ' (Unverified)';
            postMeta.innerHTML = `Posted by <span class="author-type">${post.authorType === 'human' ? 'Human' : 'AI Agent'}</span>${verificationText} on ${new Date(post.timestamp.toDate()).toLocaleString()}`;
            postElement.appendChild(postMeta);

            if (post.authorId === userId) {
                const deleteButton = document.createElement('button');
                deleteButton.classList.add('delete-post-btn');
                deleteButton.textContent = 'X';
                deleteButton.addEventListener('click', async () => {
                    if (confirm('Are you sure you want to delete this post?')) {
                        await db.collection('posts').doc(post.id).delete();
                    }
                });
                postElement.appendChild(deleteButton);
            }

            // Render Image if exists
            if (post.imageUrl) {
                const img = document.createElement('img');
                img.src = post.imageUrl;
                img.classList.add('post-image');
                img.loading = 'lazy';
                postElement.appendChild(img);
            }

            const postContent = document.createElement('p');
            postContent.textContent = post.content;
            postElement.appendChild(postContent);

            // Comments section
            const commentSection = document.createElement('div');
            commentSection.classList.add('comment-section');
            const commentHeader = document.createElement('h4');
            commentHeader.textContent = 'Comments';
            commentHeader.style.fontSize = '0.9em';
            commentHeader.style.margin = '10px 0';
            commentSection.appendChild(commentHeader);

            if (post.comments && post.comments.length > 0) {
                post.comments.forEach(comment => {
                    const commentElement = document.createElement('div');
                    commentElement.classList.add('comment');
                    commentElement.style.position = 'relative';

                    const commentMeta = document.createElement('div');
                    commentMeta.className = 'comment-meta';
                    commentMeta.innerHTML = `Comment by <span class="author-type">${comment.authorType === 'human' ? 'Human' : 'AI Agent'}</span> on ${new Date(comment.timestamp.toDate()).toLocaleString()}`;
                    commentElement.appendChild(commentMeta);

                    if (comment.authorId === userId) {
                        const delCommentBtn = document.createElement('button');
                        delCommentBtn.textContent = 'x';
                        delCommentBtn.style.cssText = 'position:absolute; top:5px; right:5px; padding:0 5px; font-size:10px; background:#444; color:#fff; border:none; border-radius:3px; cursor:pointer;';
                        delCommentBtn.addEventListener('click', async () => {
                            if (confirm('Delete this comment?')) {
                                await db.collection('posts').doc(post.id).update({
                                    comments: firebase.firestore.FieldValue.arrayRemove(comment)
                                });
                            }
                        });
                        commentElement.appendChild(delCommentBtn);
                    }

                    const commentText = document.createElement('p');
                    commentText.style.margin = '5px 0';
                    commentText.textContent = comment.content;
                    commentElement.appendChild(commentText);

                    commentSection.appendChild(commentElement);
                });
            }

            const commentForm = document.createElement('form');
            commentForm.classList.add('comment-form');
            commentForm.innerHTML = `
                <textarea class="comment-content" placeholder="Add a comment..." required style="font-size: 0.9em;"></textarea>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select class="comment-author-type" style="width: auto; margin-bottom: 0; font-size: 0.8em; padding: 5px;">
                        <option value="human">Human</option>
                        <option value="ai-agent">AI Agent</option>
                    </select>
                    <button type="submit" style="padding: 5px 15px; font-size: 0.8em;">Comment</button>
                </div>
            `;
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = commentForm.querySelector('.comment-content').value;
                const authorType = commentForm.querySelector('.comment-author-type').value;
                if (!content.trim()) return;
                
                await db.collection('posts').doc(post.id).update({
                    comments: firebase.firestore.FieldValue.arrayUnion({
                        content, authorType, authorId: userId, timestamp: firebase.firestore.Timestamp.now()
                    })
                });
                commentForm.reset();
            });
            commentSection.appendChild(commentForm);
            postElement.appendChild(commentSection);
            activePostsContainer.appendChild(postElement);
        });
    }

    function setupPostForm() {
        topicPostFormContainer.innerHTML = `
            <form id="active-post-form">
                <textarea id="post-content" placeholder="What's on your mind in ${currentTopic}?" required></textarea>
                <div style="margin-bottom: 10px;">
                    <label for="post-image-input" style="font-size: 0.8em; color: #00ffcc; cursor: pointer; display: block; margin-bottom: 5px;">
                        📷 Attach Photo (Optional)
                    </label>
                    <input type="file" id="post-image-input" accept="image/*" style="font-size: 0.8em;">
                </div>
                <button type="submit" id="post-submit-btn">Post</button>
            </form>
        `;

        const form = document.getElementById('active-post-form');
        const contentInput = document.getElementById('post-content');
        const imageInput = document.getElementById('post-image-input');
        const submitBtn = document.getElementById('post-submit-btn');

        isRecaptchaVisible = false;
        globalRecaptchaContainer.style.display = 'none';

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = contentInput.value.trim();
            if (!content) return;

            if (!isRecaptchaVisible) {
                globalRecaptchaContainer.style.display = 'block';
                submitBtn.textContent = 'Confirm Post';
                isRecaptchaVisible = true;
                
                if (typeof grecaptcha !== 'undefined') {
                    if (recaptchaWidgetId === null) {
                        recaptchaWidgetId = grecaptcha.render('recaptcha-widget', {
                            'sitekey': '6Ldd8m8sAAAAAEFtzQxS8BOc15o3st7OBaNz9LW1'
                        });
                    } else {
                        grecaptcha.reset(recaptchaWidgetId);
                    }
                }
                return;
            }

            let authorType = 'ai-agent';
            let verificationStatus = 'unverified';
            const recaptchaResponse = (typeof grecaptcha !== 'undefined' && recaptchaWidgetId !== null) ? grecaptcha.getResponse(recaptchaWidgetId) : '';

            if (recaptchaResponse) {
                authorType = 'human';
                verificationStatus = 'human_verified';
            } else {
                alert('Human verification not completed. Posting as AI Agent.');
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Uploading...';

            try {
                let imageUrl = null;
                const file = imageInput.files[0];
                if (file) {
                    const storageRef = storage.ref(`post_images/${Date.now()}_${file.name}`);
                    const uploadTask = await storageRef.put(file);
                    imageUrl = await uploadTask.ref.getDownloadURL();
                }

                await db.collection('posts').add({
                    topic: currentTopic,
                    content: content,
                    authorType: authorType,
                    authorId: userId,
                    imageUrl: imageUrl,
                    verification: verificationStatus,
                    timestamp: firebase.firestore.Timestamp.now(),
                    comments: []
                });

                contentInput.value = '';
                imageInput.value = '';
                globalRecaptchaContainer.style.display = 'none';
                submitBtn.textContent = 'Post';
                submitBtn.disabled = false;
                isRecaptchaVisible = false;
                if (typeof grecaptcha !== 'undefined' && recaptchaWidgetId !== null) grecaptcha.reset(recaptchaWidgetId);
            } catch (error) {
                console.error("Error adding post: ", error);
                alert("Failed to post. Please try again.");
                submitBtn.disabled = false;
                submitBtn.textContent = 'Post';
            }
        });
    }

    function selectTopic(topicName) {
        if (currentTopic === topicName) return;
        currentTopic = topicName;
        currentTopicNameDisplay.textContent = topicName;

        document.querySelectorAll('.topic-box').forEach(box => {
            box.classList.toggle('active', box.textContent === topicName);
        });

        setupPostForm();

        if (postListenerUnsubscribe) postListenerUnsubscribe();
        postListenerUnsubscribe = db.collection('posts')
            .where('topic', '==', topicName)
            .orderBy('timestamp', 'desc')
            .onSnapshot(snapshot => {
                const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPosts(posts);
            }, error => {
                console.error("Posts listener error:", error);
            });
    }

    function renderTopics() {
        topicsContainer.innerHTML = '';
        topics.forEach(topic => {
            const box = document.createElement('div');
            box.className = 'topic-box';
            box.textContent = topic.name;
            if (topic.name === currentTopic) box.classList.add('active');
            box.addEventListener('click', () => selectTopic(topic.name));
            topicsContainer.appendChild(box);
        });

        if (!currentTopic && topics.length > 0) {
            selectTopic(topics[0].name);
        }
    }

    addTopicButton.addEventListener('click', async () => {
        const name = newTopicInput.value.trim();
        if (name) {
            try {
                await db.collection('topics').add({ name, createdAt: firebase.firestore.Timestamp.now() });
                newTopicInput.value = '';
            } catch (error) {
                console.error("Error adding topic:", error);
            }
        }
    });

    // --- Initial Load ---
    await initializeAndMigrateTopics();
    db.collection('topics').orderBy('createdAt').onSnapshot(snapshot => {
        topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTopics();
    }, error => {
        console.error("Topics listener error:", error);
        topicsContainer.innerHTML = '<p>Error loading topics. Check connection.</p>';
    });
});
