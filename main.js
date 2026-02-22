// main.js
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', async () => {
    let topics = [];
    let currentTopic = null;
    let postListenerUnsubscribe = null;
    let userIP = '';
    const viewedPosts = new Set(); // To prevent multiple increments in one session

    // --- User Identification ---
    let userId = localStorage.getItem('carboncode_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('carboncode_user_id', userId);
    }

    async function fetchUserIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            userIP = data.ip;
        } catch (error) {
            console.error("Error fetching IP:", error);
            userIP = 'unknown'; 
        }
    }

    // --- DOM Elements ---
    const topicsContainer = document.getElementById('topics-container');
    const newTopicInput = document.getElementById('new-topic-input');
    const addTopicButton = document.getElementById('add-topic-button');
    const currentTopicNameDisplay = document.getElementById('current-topic-name');
    const topicPostFormContainer = document.getElementById('topic-post-form-container');
    const activePostsContainer = document.getElementById('active-posts-container');
    const aiTrackerInput = document.getElementById('ai_tracker');

    // --- Helper Functions ---
    async function incrementViewCount(postId) {
        if (viewedPosts.has(postId)) return;
        viewedPosts.add(postId);
        try {
            await db.collection('posts').doc(postId).update({
                views: firebase.firestore.FieldValue.increment(1)
            });
        } catch (error) {
            console.error("Error incrementing view count:", error);
        }
    }

    async function initializeAndMigrateTopics() {
        try {
            const topicsRef = db.collection('topics');
            const snapshot = await topicsRef.get();
            
            if (snapshot.empty) {
                const initialTopics = ['General', 'Business', 'Love', 'Travel', 'Future'];
                for (const name of initialTopics) {
                    await topicsRef.add({ name, createdAt: firebase.firestore.Timestamp.now() });
                }
            } else {
                const migrationMap = { 'M&A': 'Business', 'JBOD': 'Love' };
                const existingNames = snapshot.docs.map(doc => doc.data().name.trim());
                
                // Cleanup duplicates in DB if any
                const seen = new Set();
                for (const doc of snapshot.docs) {
                    const name = doc.data().name.trim();
                    if (seen.has(name)) {
                        await doc.ref.delete();
                        console.log(`Deleted duplicate topic: ${name}`);
                    } else {
                        seen.add(name);
                    }
                }

                for (const doc of snapshot.docs) {
                    if (!doc.exists) continue;
                    const data = doc.data();
                    if (migrationMap[data.name]) {
                        await doc.ref.update({ name: migrationMap[data.name] });
                    }
                }

                const requiredTopics = ['Travel', 'Future'];
                for (const name of requiredTopics) {
                    if (!existingNames.includes(name)) {
                        await topicsRef.add({ name, createdAt: firebase.firestore.Timestamp.now() });
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
            // Increment view count when rendered
            incrementViewCount(post.id);

            const postElement = document.createElement('div');
            postElement.classList.add('post');

            const postMeta = document.createElement('div');
            postMeta.classList.add('post-meta');
            
            const views = post.views || 0;
            const authorDisplay = post.authorType || 'Human';
            postMeta.innerHTML = `Posted by <span class="author-type">${authorDisplay}</span> on ${new Date(post.timestamp.toDate()).toLocaleString()} | Views: ${views}`;
            postElement.appendChild(postMeta);

            if (post.authorId === userId || (post.authorIP && userIP && post.authorIP === userIP)) {
                const deleteButton = document.createElement('button');
                deleteButton.classList.add('delete-post-btn');
                deleteButton.textContent = 'Delete';
                deleteButton.style.cssText = 'float: right; font-size: 0.8em; color: #ff4444; background: none; border: 1px solid #ff4444; cursor: pointer; border-radius: 4px; padding: 2px 5px;';
                deleteButton.addEventListener('click', async () => {
                    if (confirm('Are you sure you want to delete this post?')) {
                        await db.collection('posts').doc(post.id).delete();
                    }
                });
                postElement.appendChild(deleteButton);
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
                    commentMeta.innerHTML = `Comment by <span class="author-type">${comment.authorType || 'Human'}</span> on ${new Date(comment.timestamp.toDate()).toLocaleString()}`;
                    commentElement.appendChild(commentMeta);

                    if (comment.authorId === userId || (comment.authorIP && userIP && comment.authorIP === userIP)) {
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
                    <button type="submit" style="padding: 5px 15px; font-size: 0.8em;">Comment</button>
                </div>
            `;
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = commentForm.querySelector('.comment-content').value;
                if (!content.trim()) return;

                // Honeypot check for comments too
                const aiTrackerValue = aiTrackerInput.value;
                let authorType = "Human";
                if (aiTrackerValue !== "") {
                    authorType = "Synthetic (Bot detected)";
                }
                
                await db.collection('posts').doc(post.id).update({
                    comments: firebase.firestore.FieldValue.arrayUnion({
                        content, authorType, authorId: userId, authorIP: userIP, timestamp: firebase.firestore.Timestamp.now()
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
                <button type="submit" id="post-submit-btn">Post</button>
            </form>
        `;

        const form = document.getElementById('active-post-form');
        const contentInput = document.getElementById('post-content');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = contentInput.value.trim();
            if (!content) return;

            // Honeypot check
            const aiTrackerValue = aiTrackerInput.value;
            let authorTag = "Human";

            if (aiTrackerValue !== "") {
                authorTag = "Synthetic (Bot detected)"; 
            }

            try {
                await db.collection('posts').add({
                    topic: currentTopic,
                    content: content,
                    authorType: authorTag,
                    authorId: userId,
                    authorIP: userIP,
                    timestamp: firebase.firestore.Timestamp.now(),
                    views: 0,
                    comments: []
                });
                contentInput.value = '';
            } catch (error) {
                console.error("Error adding post: ", error);
                alert("Failed to post. Please try again.");
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
        const seenNames = new Set();
        const uniqueTopicsList = [];
        
        topics.forEach(topic => {
            const name = topic.name.trim();
            if (!seenNames.has(name)) {
                seenNames.add(name);
                uniqueTopicsList.push(topic);
            }
        });

        uniqueTopicsList.forEach(topic => {
            const box = document.createElement('div');
            box.className = 'topic-box';
            box.textContent = topic.name;
            if (topic.name === currentTopic) box.classList.add('active');
            box.addEventListener('click', () => selectTopic(topic.name));
            topicsContainer.appendChild(box);
        });

        if (!currentTopic && uniqueTopicsList.length > 0) {
            selectTopic(uniqueTopicsList[0].name);
        }
    }

    function checkSimilarity(newName, existingTopics) {
        const normalizedNew = newName.toLowerCase().trim();
        
        // Exact match
        const exact = existingTopics.find(t => t.name.toLowerCase().trim() === normalizedNew);
        if (exact) return { type: 'exact', name: exact.name };

        // Substring match or keyword overlap
        const similar = existingTopics.find(t => {
            const normalizedExisting = t.name.toLowerCase().trim();
            return normalizedNew.includes(normalizedExisting) || normalizedExisting.includes(normalizedNew);
        });
        
        if (similar) return { type: 'similar', name: similar.name };
        
        return null;
    }

    addTopicButton.addEventListener('click', async () => {
        const name = newTopicInput.value.trim();
        if (!name) return;

        const similarity = checkSimilarity(name, topics);
        
        if (similarity) {
            if (similarity.type === 'exact') {
                alert(`The topic "${similarity.name}" already exists. Please use the existing topic.`);
                selectTopic(similarity.name);
                newTopicInput.value = '';
                return;
            } else if (similarity.type === 'similar') {
                const proceed = confirm(`A similar topic "${similarity.name}" already exists. \n\nWould you like to use the existing topic instead? \n(Click "Cancel" if you still want to create "${name}")`);
                if (proceed) {
                    selectTopic(similarity.name);
                    newTopicInput.value = '';
                    return;
                }
            }
        }

        // Honeypot check for topic creation
        const aiTrackerValue = aiTrackerInput.value;
        const authorTag = aiTrackerValue !== "" ? "Synthetic (Bot detected)" : "Human";

        try {
            await db.collection('topics').add({ 
                name, 
                createdAt: firebase.firestore.Timestamp.now(),
                createdBy: userId,
                creatorType: authorTag
            });
            newTopicInput.value = '';
            // The onSnapshot listener will trigger renderTopics and we'll select it there if needed, 
            // but for now let's just let the listener handle it.
        } catch (error) {
            console.error("Error adding topic:", error);
        }
    });

    // --- Initial Load ---
    await fetchUserIP();
    await initializeAndMigrateTopics();
    db.collection('topics').orderBy('createdAt').onSnapshot(snapshot => {
        topics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTopics();
    }, error => {
        console.error("Topics listener error:", error);
        topicsContainer.innerHTML = '<p>Error loading topics. Check connection.</p>';
    });
});
