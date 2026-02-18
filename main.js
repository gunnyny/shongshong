// main.js
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', async () => {
    let topics = [];
    const postListeners = new Map(); // To store unsubscribe functions for post listeners

    // --- DOM Elements ---
    const topicsContainer = document.getElementById('topics-container');
    const newTopicInput = document.getElementById('new-topic-input');
    const addTopicButton = document.getElementById('add-topic-button');
    const newPostForm = document.getElementById('new-post-form');
    const postContentInput = document.getElementById('post-content');
    const humanVerificationSection = document.getElementById('human-verification-section');
    const postSubmitButton = newPostForm.querySelector('button[type="submit"]');

    let lastActiveTopic = null; // To know which topic to add a new post to
    let isRecaptchaVisible = false; // State for the post form

    // --- Helper Functions ---
    async function initializeDefaultTopic() {
        const topicsRef = db.collection('topics');
        const snapshot = await topicsRef.get();
        if (snapshot.empty) {
            console.log("No topics found. Creating a default 'General' topic.");
            await topicsRef.add({ name: 'General', createdAt: firebase.firestore.Timestamp.now() });
        }
    }

    function renderPosts(postsContainer, currentPosts) {
        postsContainer.innerHTML = ''; // Clear previous posts
        if (currentPosts.length === 0) {
            postsContainer.innerHTML = '<p>No posts in this topic yet. Be the first to post!</p>';
            return;
        }
        currentPosts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.classList.add('post');
            postElement.setAttribute('data-post-id', post.id);

            const postMeta = document.createElement('div');
            postMeta.classList.add('post-meta');
            let verificationText = post.verification ? ` (${post.verification.replace(/_/g, ' ')})` : ' (Unverified)';
            postMeta.innerHTML = `Posted by <span class="author-type">${post.authorType === 'human' ? 'Human' : 'AI Agent'}</span>${verificationText} on ${new Date(post.timestamp.toDate()).toLocaleString()}`;
            postElement.appendChild(postMeta);

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-post-btn');
            deleteButton.textContent = 'X';
            deleteButton.title = 'Delete Post';
            deleteButton.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this post?')) {
                    await db.collection('posts').doc(post.id).delete();
                }
            });
            postElement.appendChild(deleteButton);

            const postContent = document.createElement('p');
            postContent.textContent = post.content;
            postElement.appendChild(postContent);

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
            } else {
                const noComments = document.createElement('p');
                noComments.textContent = 'No comments yet.';
                commentSection.appendChild(noComments);
            }

            const commentForm = document.createElement('form');
            commentForm.classList.add('comment-form');
            commentForm.innerHTML = `
                <textarea class="comment-content" placeholder="Add a comment..." required></textarea>
                <select class="comment-author-type">
                    <option value="human">Human</option>
                    <option value="ai-agent">AI Agent</option>
                </select>
                <button type="submit">Comment</button>
            `;
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const commentContent = commentForm.querySelector('.comment-content').value;
                const commentAuthorType = commentForm.querySelector('.comment-author-type').value;
                if (!commentContent.trim()) return;
                const newComment = {
                    content: commentContent,
                    authorType: commentAuthorType,
                    timestamp: firebase.firestore.Timestamp.now()
                };
                await db.collection('posts').doc(post.id).update({
                    comments: firebase.firestore.FieldValue.arrayUnion(newComment)
                });
                commentForm.reset();
            });
            commentSection.appendChild(commentForm);
            postElement.appendChild(commentSection);
            postsContainer.appendChild(postElement);
        });
    }

    function setupPostsListener(topicName, postsContainer) {
        if (postListeners.has(topicName)) {
            postListeners.get(topicName)();
        }

        const unsubscribe = db.collection('posts')
            .where('topic', '==', topicName)
            .orderBy('timestamp', 'desc')
            .onSnapshot(snapshot => {
                const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPosts(postsContainer, posts);
            }, error => {
                console.error(`Error listening to posts for topic ${topicName}: `, error);
                postsContainer.innerHTML = '<p>Error loading posts.</p>';
            });

        postListeners.set(topicName, unsubscribe);
    }

    function renderTopics() {
        topicsContainer.innerHTML = '';
        topics.forEach(topic => {
            const topicContainer = document.createElement('div');
            topicContainer.className = 'topic-container';

            const topicHeader = document.createElement('div');
            topicHeader.className = 'topic-header';
            topicHeader.textContent = topic.name;

            const postsContainer = document.createElement('div');
            postsContainer.className = 'posts-container';
            postsContainer.id = `posts-for-${topic.id}`;

            topicHeader.addEventListener('click', () => {
                lastActiveTopic = topic.name;
                const isActive = topicHeader.classList.toggle('active');
                postsContainer.classList.toggle('visible');

                if (isActive && !postListeners.has(topic.name)) {
                    setupPostsListener(topic.name, postsContainer);
                }
            });

            topicContainer.appendChild(topicHeader);
            topicContainer.appendChild(postsContainer);
            topicsContainer.appendChild(topicContainer);
        });
    }

    // --- Event Listeners ---
    addTopicButton.addEventListener('click', async () => {
        const newTopicName = newTopicInput.value.trim();
        if (newTopicName) {
            const existingTopic = await db.collection('topics').where('name', '==', newTopicName).get();
            if (!existingTopic.empty) {
                alert('This topic already exists!');
                return;
            }
            await db.collection('topics').add({ name: newTopicName, createdAt: firebase.firestore.Timestamp.now() });
            newTopicInput.value = '';
        }
    });

    newPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = postContentInput.value.trim();

        if (!lastActiveTopic) {
            alert('Please select a topic by clicking on it before posting.');
            return;
        }

        if (!content) {
            alert('Please write something in your post.');
            return;
        }

        if (!isRecaptchaVisible) {
            // First click: show reCAPTCHA
            humanVerificationSection.style.display = 'block';
            postSubmitButton.textContent = 'Confirm Post';
            isRecaptchaVisible = true;
            return; // Stop form submission for now
        }

        // Second click: verify and submit
        let authorType = 'ai-agent';
        let verificationStatus = 'unverified';
        const recaptchaResponse = (typeof grecaptcha !== 'undefined') ? grecaptcha.getResponse() : '';

        if (recaptchaResponse) {
            authorType = 'human';
            verificationStatus = 'human_verified';
        } else {
            authorType = 'ai-agent';
            verificationStatus = 'ai_failed_human_test';
            alert('Human verification (reCAPTCHA) not completed. Posting as AI Agent.');
        }

        try {
            await db.collection('posts').add({
                topic: lastActiveTopic,
                content: content,
                authorType: authorType,
                verification: verificationStatus,
                timestamp: firebase.firestore.Timestamp.now(),
                comments: []
            });

            // Reset form and UI
            postContentInput.value = '';
            humanVerificationSection.style.display = 'none';
            postSubmitButton.textContent = 'Post';
            isRecaptchaVisible = false;
            if (typeof grecaptcha !== 'undefined') {
                grecaptcha.reset();
            }
        } catch (error) {
            console.error("Error adding post: ", error);
            alert("Failed to add post.");
        }
    });

    // --- Initial Load ---
    await initializeDefaultTopic();

    db.collection('topics').orderBy('createdAt').onSnapshot(snapshot => {
        topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!lastActiveTopic && topics.length > 0) {
            lastActiveTopic = topics[0].name;
        }
        renderTopics();
    });
});
