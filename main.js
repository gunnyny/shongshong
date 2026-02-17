// main.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Data Storage (using localStorage for simple persistence) ---
    let topics = JSON.parse(localStorage.getItem('topics')) || ['General', 'AI Ethics', 'Future Tech'];
    let posts = JSON.parse(localStorage.getItem('posts')) || [];
    let nextPostId = JSON.parse(localStorage.getItem('nextPostId')) || 1;
    let activeTopic = localStorage.getItem('activeTopic') || 'General';

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
    function saveAllData() {
        localStorage.setItem('topics', JSON.stringify(topics));
        localStorage.setItem('posts', JSON.stringify(posts));
        localStorage.setItem('nextPostId', JSON.stringify(nextPostId));
        localStorage.setItem('activeTopic', activeTopic);
    }

    function renderTopics() {
        topicListContainer.innerHTML = '';
        topics.forEach(topic => {
            const button = document.createElement('button');
            button.textContent = topic;
            button.classList.add('topic-button');
            if (topic === activeTopic) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                activeTopic = topic;
                applyTopicTheme(topic);
                renderTopics();
                renderPosts();
                saveAllData();
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

    function renderPosts() {
        postsContainer.innerHTML = '';
        const filteredPosts = posts.filter(post => post.topic === activeTopic);

        if (filteredPosts.length === 0) {
            postsContainer.innerHTML = '<p>No posts in this topic yet. Be the first to post!</p>';
            return;
        }

        filteredPosts.forEach(post => {
            const postElement = document.createElement('div');
            postElement.classList.add('post');
            postElement.setAttribute('data-post-id', post.id);

            const postMeta = document.createElement('div');
            postMeta.classList.add('post-meta');
            postMeta.innerHTML = `Posted by <span class="author-type">${post.authorType === 'human' ? 'Human' : 'AI Agent'}</span> on ${new Date(post.timestamp).toLocaleString()}`;
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
                    commentElement.innerHTML = `<div class="comment-meta">Comment by <span class="author-type">${comment.authorType === 'human' ? 'Human' : 'AI Agent'}</span> on ${new Date(comment.timestamp).toLocaleString()}</div><p>${comment.content}</p>`;
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
            commentForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const commentContent = commentForm.querySelector('.comment-content').value;
                const commentAuthorType = commentForm.querySelector('.comment-author-type').value;

                const newComment = {
                    id: Date.now(), // Simple unique ID
                    content: commentContent,
                    authorType: commentAuthorType,
                    timestamp: new Date().toISOString()
                };

                const postIndex = posts.findIndex(p => p.id === post.id);
                if (postIndex > -1) {
                    if (!posts[postIndex].comments) {
                        posts[postIndex].comments = [];
                    }
                    posts[postIndex].comments.push(newComment);
                    saveAllData();
                    renderPosts(); // Re-render to show new comment
                }
            });
            commentSection.appendChild(commentForm);

            postElement.appendChild(commentSection);
            postsContainer.appendChild(postElement);
        });
    }

    // --- Event Listeners ---
    addTopicButton.addEventListener('click', () => {
        const newTopicName = newTopicInput.value.trim();
        if (newTopicName && !topics.includes(newTopicName)) {
            topics.push(newTopicName);
            newTopicInput.value = '';
            renderTopics();
            saveAllData();
        } else if (topics.includes(newTopicName)) {
            alert('This topic already exists!');
        }
    });

    newPostForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const content = postContentInput.value.trim();
        const authorType = postAuthorTypeSelect.value;

        if (content) {
            const newPost = {
                id: nextPostId++,
                topic: activeTopic,
                content: content,
                authorType: authorType,
                timestamp: new Date().toISOString(),
                comments: []
            };
            posts.unshift(newPost); // Add to the beginning
            postContentInput.value = '';
            renderPosts();
            saveAllData();
        }
    });

    // --- Initial Render ---
    applyTopicTheme(activeTopic);
    renderTopics();
    renderPosts();
});
