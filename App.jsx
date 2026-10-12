import { useState } from "react";
import "./App.css";

const API = "https://online-auction-backend-production.up.railway.app/api";
const BUYER_ID = 1;

function App() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState("");
  const [products, setProducts] = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    category: "HOUSE",
    imageUrl: "",
    startingPrice: ""
  });

  const [auctionForm, setAuctionForm] = useState({
    productId: "",
    startTime: "",
    endTime: "",
    minimumBidIncrement: "500"
  });

  const money = (value) =>
    Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2
    });

  const getHeaders = (jwt = token) => ({
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json"
  });

  const loadData = async (jwt) => {
    const headers = { Authorization: `Bearer ${jwt}` };

    const [productResponse, auctionResponse] = await Promise.all([
      fetch(`${API}/products`, { headers }),
      fetch(`${API}/auctions`, { headers })
    ]);

    if (!productResponse.ok || !auctionResponse.ok) {
      throw new Error("Unable to load products or auctions.");
    }

    const productData = await productResponse.json();
    const auctionData = await auctionResponse.json();

    setProducts(Array.isArray(productData) ? productData : []);
    setAuctions(Array.isArray(auctionData) ? auctionData : []);

    try {
      const response = await fetch(
        `${API}/notifications/user/${BUYER_ID}`,
        { headers }
      );

      if (response.ok) {
        const data = await response.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Notifications could not be loaded:", error);
    }
  };

  const register = async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password
        })
      });

      const text = await response.text();
      let result = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = { message: text };
      }

      if (!response.ok) {
        setMessage(
          result.error || result.message ||
          "Registration failed. Please check your details."
        );
        return;
      }

      setIsRegister(false);
      setName("");
      setPassword("");
      setMessage("Registration successful! Please log in.");
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect to the registration service.");
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });

      if (!response.ok) {
        setMessage("Invalid email or password.");
        return;
      }

      const jwt = (await response.text())
        .trim()
        .replace(/^"|"$/g, "");

      if (jwt.split(".").length !== 3) {
        setMessage("Invalid login response.");
        return;
      }

      let userRole = "BUYER";

      try {
        const payload = JSON.parse(atob(jwt.split(".")[1]));
        const claims = String(
          payload.role ||
          payload.roles ||
          payload.authorities ||
          ""
        ).toUpperCase();

        if (claims.includes("ADMIN")) {
          userRole = "ADMIN";
        } else if (claims.includes("SELLER")) {
          userRole = "SELLER";
        }
      } catch (error) {
        console.error("Could not read role:", error);
      }

      setToken(jwt);
      setRole(userRole);

      await loadData(jwt);
      setMessage("Login successful!");
    } catch (error) {
      console.error(error);
      setMessage("Cannot connect to Spring Boot on port 8080.");
    } finally {
      setLoading(false);
    }
  };

  // Automatically create auctions for products without active auctions.
  const createDemoAuctions = async () => {
    setLoading(true);
    setMessage("");

    try {
      const activeProductIds = new Set(
        auctions
          .filter((auction) => auction.status === "ACTIVE")
          .map((auction) => Number(auction.productId))
      );

      const availableProducts = products.filter(
        (product) =>
          product.id != null &&
          product.name &&
          product.startingPrice != null &&
          !activeProductIds.has(Number(product.id))
      );

      if (availableProducts.length === 0) {
        setMessage("All products already have active auctions.");
        return;
      }

      const formatDate = (date) => {
        const pad = (number) => String(number).padStart(2, "0");

        return (
          date.getFullYear() +
          "-" + pad(date.getMonth() + 1) +
          "-" + pad(date.getDate()) +
          "T" + pad(date.getHours()) +
          ":" + pad(date.getMinutes()) +
          ":" + pad(date.getSeconds())
        );
      };

      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      let created = 0;
      let failed = 0;

      for (const product of availableProducts) {
        try {
          const response = await fetch(`${API}/auctions`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({
              productId: Number(product.id),
              startTime: formatDate(start),
              endTime: formatDate(end),
              currentBid: Number(product.startingPrice),
              minimumBidIncrement: 500,
              status: "ACTIVE"
            })
          });

          if (response.ok) {
            created++;
          } else {
            failed++;
            console.error(
              "Auction creation failed for product:",
              product.id,
              await response.text()
            );
          }
        } catch (error) {
          failed++;
          console.error(error);
        }
      }

      await loadData(token);

      setMessage(
        `${created} auction(s) created successfully.` +
        (failed ? ` ${failed} failed. Check seller permissions.` : "")
      );
    } catch (error) {
      console.error(error);
      setMessage("Unable to prepare auctions. Check the backend.");
    } finally {
      setLoading(false);
    }
  };

  const viewAuction = (product) => {
    const matching = auctions
      .filter(
        (auction) =>
          Number(auction.productId) === Number(product.id)
      )
      .sort((a, b) => Number(b.id) - Number(a.id));

    if (matching.length === 0) {
      setSelectedAuction(null);
      setMessage("No auction found for this product.");
      return;
    }

    const auction =
      matching.find((item) => item.status === "ACTIVE") ||
      matching[0];

    setSelectedAuction({ ...auction, product });
    setBidAmount("");
    setMessage("");

    window.requestAnimationFrame(() => {
      document.getElementById("auction-details")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  };

  const placeBid = async () => {
    if (!selectedAuction) return;

    if (selectedAuction.status !== "ACTIVE") {
      setMessage("This auction is closed.");
      return;
    }

    const amount = Number(bidAmount);
    const minimum =
      Number(selectedAuction.currentBid || 0) +
      Number(selectedAuction.minimumBidIncrement || 0);

    if (!Number.isFinite(amount) || amount < minimum) {
      setMessage(`Your bid must be at least ₹${money(minimum)}.`);
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/bids`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          auctionId: selectedAuction.id,
          bidderId: BUYER_ID,
          amount
        })
      });

      const text = await response.text();
      let result = {};

      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = { error: text };
      }

      if (!response.ok) {
        setMessage(
          result.error || result.message || "Bid was rejected."
        );
        return;
      }

      await loadData(token);

      const responseAuctions = await fetch(`${API}/auctions`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (responseAuctions.ok) {
        const data = await responseAuctions.json();
        setAuctions(data);

        const updated = data.find(
          (item) =>
            Number(item.id) === Number(selectedAuction.id)
        );

        if (updated) {
          setSelectedAuction({
            ...updated,
            product: selectedAuction.product
          });
        }
      }

      setBidAmount("");
      setMessage("Bid placed successfully!");
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect to the bidding service.");
    } finally {
      setLoading(false);
    }
  };

  const addProduct = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API}/products`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          ...productForm,
          startingPrice: Number(productForm.startingPrice)
        })
      });

      const text = await response.text();
      let result = {};

      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = { error: text };
      }

      if (!response.ok) {
        setMessage(
          result.error || result.message || "Could not add product."
        );
        return;
      }

      setProductForm({
        name: "",
        description: "",
        category: "HOUSE",
        imageUrl: "",
        startingPrice: ""
      });

      await loadData(token);
      setMessage("Product added successfully!");
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect while adding product.");
    } finally {
      setLoading(false);
    }
  };

  const createAuction = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const start = new Date(auctionForm.startTime);
    const end = new Date(auctionForm.endTime);

    if (
      !auctionForm.productId ||
      !auctionForm.startTime ||
      !auctionForm.endTime ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      setMessage("Select a product and valid start/end times.");
      setLoading(false);
      return;
    }

    if (start < new Date()) {
      setMessage("Choose a start time that is now or in the future.");
      setLoading(false);
      return;
    }

    const product = products.find(
      (item) => Number(item.id) === Number(auctionForm.productId)
    );

    if (!product) {
      setMessage("Please select a valid product.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API}/auctions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productId: Number(product.id),
          startTime: auctionForm.startTime + ":00",
          endTime: auctionForm.endTime + ":00",
          currentBid: Number(product.startingPrice || 0),
          minimumBidIncrement: Number(
            auctionForm.minimumBidIncrement
          ),
          status: "ACTIVE"
        })
      });

      const text = await response.text();
      let result = {};

      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = { error: text };
      }

      if (!response.ok) {
        setMessage(
          result.error || result.message || "Could not create auction."
        );
        return;
      }

      await loadData(token);

      setAuctionForm({
        productId: "",
        startTime: "",
        endTime: "",
        minimumBidIncrement: "500"
      });

      setMessage("Auction created successfully!");
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect while creating auction.");
    } finally {
      setLoading(false);
    }
  };

  const refreshNotifications = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `${API}/notifications/user/${BUYER_ID}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        setMessage("Could not refresh notifications.");
        return;
      }

      const data = await response.json();
      setNotifications(Array.isArray(data) ? data : []);
      setMessage("Notifications refreshed.");
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect to notifications.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken("");
    setRole("");
    setProducts([]);
    setAuctions([]);
    setNotifications([]);
    setSelectedAuction(null);
    setPassword("");
    setMessage("Logged out successfully.");
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🏷️ Online Auction</h1>
        <nav>
          <a href="#home">Home</a>
          {token && (
            <>
              <a href="#products">Products</a>
              <a href="#notifications">Notifications</a>
              {(role === "SELLER" || role === "ADMIN") && (
                <a href="#seller-dashboard">Seller Dashboard</a>
              )}
              <button onClick={logout}>Logout</button>
            </>
          )}
        </nav>
      </header>

      <section className="hero" id="home">
        <h2>Find. Bid. Win.</h2>
        <p>Discover products and properties through online auctions.</p>
      </section>

      {!token && (
        <section className="login" id="login">
          <h2>{isRegister ? "📝 Create Account" : "🔐 Login"}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (isRegister) register();
              else login();
            }}
          >
            {isRegister && (
              <input
                type="text"
                required
                minLength="2"
                maxLength="80"
                placeholder="Full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
            <input
              type="email"
              required
              maxLength="254"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              type="password"
              required
              minLength={isRegister ? 8 : 1}
              maxLength="72"
              placeholder={isRegister ? "Password (at least 8 characters)" : "Password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Please wait..." : isRegister ? "Register" : "Login"}
            </button>
          </form>
          <p>
            {isRegister ? "Already have an account?" : "New to Online Auction?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setMessage("");
              }}
              disabled={loading}
            >
              {isRegister ? "Login here" : "Create an account"}
            </button>
          </p>
          <p className="message">{message}</p>
        </section>
      )}

      {token && (
        <>
          {(role === "SELLER" || role === "ADMIN") && (
            <section
              className="section seller-dashboard"
              id="seller-dashboard"
            >
              <h2>🧑‍💼 Seller Dashboard</h2>
              <p>Add products and prepare auctions for your review.</p>

              <div className="demo-button">
                <button
                  type="button"
                  onClick={createDemoAuctions}
                  disabled={loading}
                >
                  {loading
                    ? "Preparing..."
                    : "Prepare Demo Auctions"}
                </button>
              </div>

              <p className="message">{message}</p>

              <h3>Add Product</h3>
              <form className="seller-form" onSubmit={addProduct}>
                <input
                  required
                  placeholder="Product name"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      name: event.target.value
                    })
                  }
                />

                <textarea
                  required
                  placeholder="Product description"
                  value={productForm.description}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      description: event.target.value
                    })
                  }
                />

                <select
                  value={productForm.category}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      category: event.target.value
                    })
                  }
                >
                  <option value="HOUSE">HOUSE</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Mobile">Mobile</option>
                  <option value="Furniture">Furniture</option>
                  <option value="Other">Other</option>
                </select>

                <input
                  placeholder="Image URL (example: /house1.jpg)"
                  value={productForm.imageUrl}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      imageUrl: event.target.value
                    })
                  }
                />

                <input
                  required
                  type="number"
                  min="1"
                  placeholder="Starting price in rupees"
                  value={productForm.startingPrice}
                  onChange={(event) =>
                    setProductForm({
                      ...productForm,
                      startingPrice: event.target.value
                    })
                  }
                />

                <button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Add Product"}
                </button>
              </form>

              <h3>Create Individual Auction</h3>
              <form className="seller-form" onSubmit={createAuction}>
                <select
                  required
                  value={auctionForm.productId}
                  onChange={(event) =>
                    setAuctionForm({
                      ...auctionForm,
                      productId: event.target.value
                    })
                  }
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} (ID {product.id})
                    </option>
                  ))}
                </select>

                <label>Start time</label>
                <input
                  required
                  type="datetime-local"
                  value={auctionForm.startTime}
                  onChange={(event) =>
                    setAuctionForm({
                      ...auctionForm,
                      startTime: event.target.value
                    })
                  }
                />

                <label>End time</label>
                <input
                  required
                  type="datetime-local"
                  value={auctionForm.endTime}
                  onChange={(event) =>
                    setAuctionForm({
                      ...auctionForm,
                      endTime: event.target.value
                    })
                  }
                />

                <input
                  required
                  type="number"
                  min="1"
                  placeholder="Minimum bid increment"
                  value={auctionForm.minimumBidIncrement}
                  onChange={(event) =>
                    setAuctionForm({
                      ...auctionForm,
                      minimumBidIncrement: event.target.value
                    })
                  }
                />

                <button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create Auction"}
                </button>
              </form>
            </section>
          )}

          <section className="section" id="products">
            <h2>🔥 Products & Properties</h2>

            <div className="cards">
              {products
                .filter(
                  (product) =>
                    product.name && product.startingPrice != null
                )
                .map((product) => {
                  const matching = auctions
                    .filter(
                      (auction) =>
                        Number(auction.productId) === Number(product.id)
                    )
                    .sort((a, b) => Number(b.id) - Number(a.id));

                  const auction =
                    matching.find((item) => item.status === "ACTIVE") ||
                    matching[0];

                  const isHouse =
                    String(product.category).toUpperCase() === "HOUSE";

                  // Images placed inside the frontend's public folder are served
                  // from the site root, e.g. public/house1.jpg -> /house1.jpg.
                  const imageUrl = product.imageUrl
                    ? /^https?:\/\//i.test(product.imageUrl)
                      ? product.imageUrl
                      : `/${product.imageUrl.replace(/^\/+/, "")}`
                    : "";

                  return (
                    <div className="card" key={product.id}>
                      <div className="image">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={product.name}
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                              const fallback = event.currentTarget.parentElement;
                              if (fallback && !fallback.querySelector(".image-fallback")) {
                                const icon = document.createElement("span");
                                icon.className = "image-fallback";
                                icon.textContent = isHouse ? "🏠" : "📱";
                                fallback.appendChild(icon);
                              }
                            }}
                          />
                        ) : (
                          <span>{isHouse ? "🏠" : "📱"}</span>
                        )}
                      </div>

                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      <p>Category: {product.category}</p>
                      <p>Starting Price: ₹{money(product.startingPrice)}</p>

                      {auction ? (
                        <>
                          <p>Current Bid: ₹{money(auction.currentBid)}</p>
                          <p>Status: {auction.status}</p>
                          <button onClick={() => viewAuction(product)}>
                            View Auction
                          </button>
                        </>
                      ) : (
                        <p>No auction created yet.</p>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>

          <section className="section" id="notifications">
            <h2>🔔 My Notifications</h2>
            <button
              onClick={refreshNotifications}
              disabled={loading}
            >
              Refresh Notifications
            </button>
            <p>Total notifications: {notifications.length}</p>

            <div className="cards">
              {notifications.map((notification) => (
                <div className="card" key={notification.id}>
                  <h3>
                    {String(
                      notification.type || "NOTIFICATION"
                    ).replaceAll("_", " ")}
                  </h3>
                  <p>{notification.message}</p>
                  <p>
                    {notification.createdAt
                      ? new Date(
                          notification.createdAt
                        ).toLocaleString("en-IN")
                      : ""}
                  </p>
                  <p>
                    {notification.readStatus ? "Read" : "Unread"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {selectedAuction && (
        <section className="section auction-details" id="auction-details">
          <h2>🔨 {selectedAuction.product.name}</h2>
          <p>Auction ID: {selectedAuction.id}</p>
          <p>Current Bid: ₹{money(selectedAuction.currentBid)}</p>
          <p>
            Minimum Bid Increment: ₹
            {money(selectedAuction.minimumBidIncrement)}
          </p>
          <p>Status: {selectedAuction.status}</p>
          <p>
            Ends:{" "}
            {selectedAuction.endTime
              ? new Date(selectedAuction.endTime).toLocaleString("en-IN")
              : "Not specified"}
          </p>

          {selectedAuction.status === "ACTIVE" ? (
            <div className="bid-form">
              <input
                type="number"
                min="1"
                placeholder="Enter your bid amount"
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
              />
              <button onClick={placeBid} disabled={loading}>
                {loading ? "Submitting..." : "Place Bid"}
              </button>
            </div>
          ) : (
            <p>This auction is closed.</p>
          )}

          <p className="message">{message}</p>
          <button onClick={() => setSelectedAuction(null)}>
            Close Details
          </button>
        </section>
      )}

      <footer>
        <p>© 2026 Online Auction Management System</p>
      </footer>
    </div>
  );
}

export default App;
