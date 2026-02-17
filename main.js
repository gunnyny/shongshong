// main.js

// TODO: Ensure you have updated your Firebase configuration in index.html

// Get a reference to the Firestore database
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', async () => { // Make the DOMContentLoaded listener async
    // --- Data Storage (will be managed by Firestore) ---
    // These will be populated from Firestore
    let topics = [];
    let posts = [];
    let activeTopic = 'General'; // Default active topic

    // Function to initialize a default topic if none exist
    async function initializeDefaultTopic() {
        const topicsRef = db.collection('topics');
        const snapshot = await topicsRef.get();
        if (snapshot.empty) {
            console.log("No topics found. Creating a default 'General' topic.");
            await topicsRef.add({
                name: 'General',
                createdAt: firebase.firestore.Timestamp.now()
            });
        }
    }

    // Call the function to initialize default topic
    await initializeDefaultTopic();

    // --- DOM Elements ---
    const topicListContainer = document.getElementById('topic-list');
    const newTopicInput = document.getElementById('new-topic-input');
    const addTopicButton = document.getElementById('add-topic-button');
    const postsContainer = document.getElementById('posts-container');
    const newPostForm = document.getElementById('new-post-form');
    const postContentInput = document.getElementById('post-content');
    const postAuthorTypeSelect = document.getElementById('post-author-type');
    const mainElement = document.querySelector('main');

    // --- Helper Functions ---
    // saveAllData function is no longer needed as Firestore handles persistence

    let unsubscribeFromPosts = null; // To store the unsubscribe function for posts listener

    function renderTopics() {
        topicListContainer.innerHTML = '';
        topics.forEach(topic => {
            const button = document.createElement('button');
            button.textContent = topic.name; // Assuming topic objects have a 'name' field
            button.classList.add('topic-button');
            if (topic.name === activeTopic) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                activeTopic = topic.name;
                applyTopicTheme(topic.name);
                renderTopics();
                // When topic changes, we need to fetch and render posts for that topic
                fetchAndRenderPosts();
            });
            topicListContainer.appendChild(button);
        });
    }

    function applyTopicTheme(topic) {
        // A very basic theme change based on topic
        // In a real app, this could change background, colors, fonts, etc.
        mainElement.className = ''; // Clear previous themes
        mainElement.classList.add(`theme-${topic.toLowerCase().replace(/\s/g, '-')}`);
    }

    function renderPosts(currentPosts) { // Renamed from fetchAndRenderPosts
        postsContainer.innerHTML = '';


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
                postMeta.innerHTML = `Posted by <span class="author-type">${post.authorType === 'human' ? 'Human' : 'AI Agent'}</span> on ${new Date(post.timestamp.toDate()).toLocaleString()}`;
                postElement.appendChild(postMeta);

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
                } else {
                    const noComments = document.createElement('p');
                    noComments.textContent = 'No comments yet.';
                    commentSection.appendChild(noComments);
                }

                // Comment form
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

                    if (commentContent.trim() === '') return;

                    const newComment = {
                        content: commentContent,
                        authorType: commentAuthorType,
                        timestamp: firebase.firestore.Timestamp.now()
                    };

                    try {
                        // Add comment to the post's comments array in Firestore
                        await db.collection('posts').doc(post.id).update({
                            comments: firebase.firestore.FieldValue.arrayUnion(newComment)
                        });
                        commentForm.reset();
                        // No need to call renderPosts here, listener will handle it
                    } catch (error) {
                        console.error("Error adding comment: ", error);
                        alert("Failed to add comment.");
                    }
                });
                commentSection.appendChild(commentForm);

                postElement.appendChild(commentSection);
                postsContainer.appendChild(postElement);
            });

    }

    function setupPostsListener(topicName) {
        if (unsubscribeFromPosts) {
            unsubscribeFromPosts(); // Unsubscribe from previous topic's listener
        }
        unsubscribeFromPosts = db.collection('posts')
            .where('topic', '==', topicName)
            .orderBy('timestamp', 'desc')
            .onSnapshot(snapshot => {
                posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPosts(posts); // Render posts received from snapshot
            }, error => {
                console.error("Error listening to posts: ", error);
                postsContainer.innerHTML = '<p>Error loading posts.</p>';
            });
    }

    // --- Event Listeners ---
    addTopicButton.addEventListener('click', async () => {
        const newTopicName = newTopicInput.value.trim();
        if (newTopicName) {
            try {
                // Check if topic already exists
                const existingTopic = await db.collection('topics').where('name', '==', newTopicName).get();
                if (!existingTopic.empty) {
                    alert('This topic already exists!');
                    return;
                }

                await db.collection('topics').add({
                    name: newTopicName,
                    createdAt: firebase.firestore.Timestamp.now()
                });
                newTopicInput.value = '';
                // Topics will be re-rendered by the real-time listener
            } catch (error) {
                console.error("Error adding topic: ", error);
                alert("Failed to add topic.");
            }
        }
    });

    newPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = postContentInput.value.trim();
        const authorType = postAuthorTypeSelect.value;

        if (content && activeTopic) {
            try {
                const docRef = await db.collection('posts').add({
                    topic: activeTopic,
                    content: content,
                    authorType: authorType,
                    timestamp: firebase.firestore.Timestamp.now(),
                    comments: [] // Initialize with an empty array for comments
                });
                console.log("Post added successfully with ID: ", docRef.id);
                postContentInput.value = '';
                // Posts will be re-rendered by the real-time listener or explicit call
            } catch (error) {
                console.error("Error adding post: ", error);
                alert("Failed to add post.");
            }
        } else {
            alert('Please select a topic and enter post content.');
        }
    });

    // --- Real-time Listeners (for initial render and subsequent updates) ---
    // Listen for topic changes
    db.collection('topics').orderBy('createdAt').onSnapshot(snapshot => {
        topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (topics.length > 0 && !topics.some(t => t.name === activeTopic)) {
            activeTopic = topics[0].name; // Set first topic as active if current is gone
        } else if (topics.length === 0) {
            activeTopic = 'General'; // Reset if no topics
        }
        applyTopicTheme(activeTopic);
        renderTopics();
        setupPostsListener(activeTopic); // Setup posts listener when topics change
    });
    // Initial setup of posts listener
    setupPostsListener(activeTopic);
});
