// main.js
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', async () => {
    let topics = [];
    let currentTopic = null;
    let postListenerUnsubscribe = null;

    // --- DOM Elements ---
    const topicsContainer = document.getElementById('topics-container');
    const newTopicInput = document.getElementById('new-topic-input');
    const addTopicButton = document.getElementById('add-topic-button');
    const currentTopicNameDisplay = document.getElementById('current-topic-name');
    const topicPostFormContainer = document.getElementById('topic-post-form-container');
    const activePostsContainer = document.getElementById('active-posts-container');

    let isRecaptchaVisible = false;

    // --- Helper Functions ---
    async function initializeDefaultTopic() {
        const topicsRef = db.collection('topics');
        const snapshot = await topicsRef.get();
        if (snapshot.empty) {
            console.log("No topics found. Creating a default 'General' topic.");
            await topicsRef.add({ name: 'General', createdAt: firebase.firestore.Timestamp.now() });
        }
    }

    function renderPosts(posts) {
        activePostsContainer.innerHTML = '';
        if (posts.length === 0) {
            activePostsContainer.innerHTML = '<p>No posts in this topic yet. Be the first to post!</p>';
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

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-post-btn');
            deleteButton.textContent = 'X';
            deleteButton.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this post?')) {
                    await db.collection('posts').doc(post.id).delete();
                }
            });
            postElement.appendChild(deleteButton);

            const postContent = document.createElement('p');
            postContent.textContent = post.content;
            postElement.appendChild(postContent);

            // Comments section
            const commentSection = document.createElement('div');
            commentSection.classList.add('comment-section');
            const commentHeader = document.createElement('h4');
            commentHeader.textContent = 'Comments';
            commentSection.appendChild(commentHeader);

            if (post.comments && post.comments.length > 0) {
                post.comments.forEach(comment => {
                    const commentElement = document.createElement('div');
                    commentElement.classList.add('comment');
                    commentElement.innerHTML = `<div class="comment-meta">Comment by <span class="author-type">${comment.authorType === 'human' ? 'Human' : 'AI Agent'}</span> on ${new Date(comment.timestamp.toDate()).toLocaleString()}</div><p>${comment.content}</p>`;
                    commentSection.appendChild(commentElement);
                });
            }

            const commentForm = document.createElement('form');
            commentForm.classList.add('comment-form');
            commentForm.innerHTML = `
                <textarea class="comment-content" placeholder="Add a comment..." required></textarea>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select class="comment-author-type" style="width: auto; margin-bottom: 0;">
                        <option value="human">Human</option>
                        <option value="ai-agent">AI Agent</option>
                    </select>
                    <button type="submit" style="padding: 5px 15px;">Comment</button>
                </div>
            `;
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = commentForm.querySelector('.comment-content').value;
                const authorType = commentForm.querySelector('.comment-author-type').value;
                if (!content.trim()) return;
                await db.collection('posts').doc(post.id).update({
                    comments: firebase.firestore.FieldValue.arrayUnion({
                        content, authorType, timestamp: firebase.firestore.Timestamp.now()
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
                <div id="human-verification-section" style="display: none; margin-bottom: 10px;">
                    <div class="g-recaptcha" data-sitekey="6Ldd8m8sAAAAAEFtzQxS8BOc15o3st7OBaNz9LW1"></div>
                </div>
                <button type="submit" id="post-submit-btn">Post</button>
            </form>
        `;

        const form = document.getElementById('active-post-form');
        const contentInput = document.getElementById('post-content');
        const verificationSection = document.getElementById('human-verification-section');
        const submitBtn = document.getElementById('post-submit-btn');

        isRecaptchaVisible = false;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = contentInput.value.trim();
            if (!content) return;

            if (!isRecaptchaVisible) {
                verificationSection.style.display = 'block';
                submitBtn.textContent = 'Confirm Post';
                isRecaptchaVisible = true;
                if (typeof grecaptcha !== 'undefined') {
                    grecaptcha.render(verificationSection.querySelector('.g-recaptcha'));
                }
                return;
            }

            let authorType = 'ai-agent';
            let verificationStatus = 'unverified';
            const recaptchaResponse = (typeof grecaptcha !== 'undefined') ? grecaptcha.getResponse() : '';

            if (recaptchaResponse) {
                authorType = 'human';
                verificationStatus = 'human_verified';
            } else {
                alert('Human verification not completed. Posting as AI Agent.');
            }

            try {
                await db.collection('posts').add({
                    topic: currentTopic,
                    content: content,
                    authorType: authorType,
                    verification: verificationStatus,
                    timestamp: firebase.firestore.Timestamp.now(),
                    comments: []
                });
                contentInput.value = '';
                verificationSection.style.display = 'none';
                submitBtn.textContent = 'Post';
                isRecaptchaVisible = false;
                if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
            } catch (error) {
                console.error("Error adding post: ", error);
            }
        });
    }

    function selectTopic(topicName) {
        if (currentTopic === topicName) return;
        currentTopic = topicName;
        currentTopicNameDisplay.textContent = topicName;

        // Update UI
        document.querySelectorAll('.topic-box').forEach(box => {
            box.classList.toggle('active', box.textContent === topicName);
        });

        // Setup form
        setupPostForm();

        // Setup listener
        if (postListenerUnsubscribe) postListenerUnsubscribe();
        postListenerUnsubscribe = db.collection('posts')
            .where('topic', '==', topicName)
            .orderBy('timestamp', 'desc')
            .onSnapshot(snapshot => {
                const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPosts(posts);
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

    // --- Listeners ---
    addTopicButton.addEventListener('click', async () => {
        const name = newTopicInput.value.trim();
        if (name) {
            await db.collection('topics').add({ name, createdAt: firebase.firestore.Timestamp.now() });
            newTopicInput.value = '';
        }
    });

    // --- Initial Load ---
    await initializeDefaultTopic();
    db.collection('topics').orderBy('createdAt').onSnapshot(snapshot => {
        topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTopics();
    });
});
