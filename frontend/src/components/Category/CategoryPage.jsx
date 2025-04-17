import React, { useState, useRef, useCallback } from 'react';
import img from '../../assets/MockUp.png';
import * as XLSX from 'xlsx';

// Generate simple UUID-like ID
const generateId = () => Math.floor(Math.random() * 1000000) + 10;

// Helper function to validate image
const validateImage = (file, setError) => {
  if (!file) return false;
  if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
    setError('Please upload a valid image (JPEG, PNG, or GIF)');
    return false;
  }
  if (file.size > 2 * 1024 * 1024) {
    setError('Image size must be less than 2MB');
    return false;
  }
  return true;
};

const CreateSingleCategoryModal = ({ isOpen, onClose, onSubmit, item }) => {
  const [name, setName] = useState(item?.name || '');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(item?.image || null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files[0];
    if (validateImage(file, setError)) {
      setError('');
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError('');

      if (!name.trim()) {
        setError('Name is required');
        setIsSubmitting(false);
        return;
      }

      setTimeout(() => {
        const newItem = { name, image: imagePreview || item?.image || img };
        onSubmit(newItem);
        setName('');
        setImage(null);
        setImagePreview(null);
        setError('');
        setIsSubmitting(false);
        onClose();
      }, 500);
    },
    [name, imagePreview, item, onSubmit, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {item ? 'Edit' : 'Create New'} Category
        </h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="category-name" className="block text-sm font-medium text-gray-700 mb-1">
              Category Name
            </label>
            <input
              id="category-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              aria-required="true"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="category-image" className="block text-sm font-medium text-gray-700 mb-1">
              Image
            </label>
            <input
              id="category-image"
              type="file"
              accept="image/jpeg,image/png,image/gif"
              onChange={handleImageChange}
              className="w-full border rounded-md px-3 py-2"
              aria-label="Upload image for category"
            />
            {(imagePreview || item?.image) && (
              <img
                src={imagePreview || item.image}
                alt="Preview"
                className="mt-2 w-32 h-32 object-contain rounded-md"
              />
            )}
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              disabled={isSubmitting}
              aria-label="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
              disabled={isSubmitting}
              aria-label={item ? 'Update Category' : 'Create Category'}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {item ? 'Updating...' : 'Creating...'}
                </>
              ) : item ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const BulkCreateCategoryModal = ({ isOpen, onClose, onSubmit }) => {
  const [excelFile, setExcelFile] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleExcelChange = useCallback((e) => {
    const file = e.target.files[0];
    if (file) {
      // Expanded MIME type validation
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/octet-stream', // Fallback for some .xlsx files
      ];
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xls|xlsx|csv)$/i)) {
        setError('Please upload a valid Excel or CSV file (.xls, .xlsx, .csv)');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setError('');
      setExcelFile(file);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError('');

      if (!excelFile) {
        setError('Please select an Excel or CSV file');
        setIsSubmitting(false);
        return;
      }

      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = event.target.result;
            const workbook = XLSX.read(data, {
              type: excelFile.type === 'text/csv' ? 'string' : 'array',
              raw: excelFile.type === 'text/csv',
            });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Log raw data for debugging (remove in production)
            console.log('Raw JSON data:', jsonData);

            // Find the "Category Name" column (case-insensitive, common variations)
            const headers = jsonData[0] || [];
            const categoryNameCol = headers.findIndex((header) =>
              header && ['category name', 'category', 'name'].includes(header.toString().toLowerCase())
            );

            if (categoryNameCol === -1) {
              setError("Missing 'Category Name' column in the file");
              setIsSubmitting(false);
              return;
            }

            // Process rows, skipping the header
            const items = jsonData
              .slice(1)
              .map((row) => ({
                name: row[categoryNameCol]?.toString().trim(),
                image: row[headers.findIndex((h) => h && h.toString().toLowerCase() === 'image')] || img,
                subcategories: [],
              }))
              .filter((item) => item.name && item.name.length > 0);

            if (items.length === 0) {
              setError('Excel/CSV file contains no valid category entries');
              setIsSubmitting(false);
              return;
            }

            // Log processed items for debugging (remove in production)
            console.log('Processed items:', items);

            items.forEach((item) => {
              onSubmit(item);
            });

            setExcelFile(null);
            setIsSubmitting(false);
            onClose();
          } catch (parseError) {
            console.error('Error parsing file:', parseError);
            setError('Failed to parse Excel/CSV file. Please ensure it is not corrupted.');
            setIsSubmitting(false);
          }
        };
        reader.onerror = () => {
          setError('Error reading the file. Please try again.');
          setIsSubmitting(false);
        };
        if (excelFile.type === 'text/csv') {
          reader.readAsText(excelFile);
        } else {
          reader.readAsArrayBuffer(excelFile);
        }
      } catch (err) {
        console.error('Error processing file:', err);
        setError('Error processing Excel/CSV file. Please try again.');
        setIsSubmitting(false);
      }
    },
    [excelFile, onSubmit, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Bulk Upload Categories</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upload Excel/CSV File
            </label>
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={handleExcelChange}
              className="w-full border rounded-md px-3 py-2"
              aria-label="Upload Excel or CSV file for bulk category creation"
            />
            <p className="text-xs text-gray-500 mt-1">
              File should have a column named 'Category Name', 'Category', or 'Name' (required) and optional 'Image' (URL)
            </p>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              disabled={isSubmitting}
              aria-label="Cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center"
              disabled={isSubmitting}
              aria-label="Upload Categories"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </>
              ) : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ExpenseCategoryPage = () => {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const categorySliderRef = useRef(null);
  const [categoryCurrentSlide, setCategoryCurrentSlide] = useState(0);

  const handleCategoryClick = useCallback((category) => {
    setIsLoading(true);
    setTimeout(() => {
      setSelectedCategory(category);
      setIsLoading(false);
    }, 300);
  }, []);

  const handleBack = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      setSelectedCategory(null);
      setIsLoading(false);
    }, 300);
  }, []);

  const openSingleModal = useCallback((item = null) => {
    setEditItem(item);
    setIsSingleModalOpen(true);
  }, []);

  const openBulkModal = useCallback(() => {
    setIsBulkModalOpen(true);
  }, []);

  const handleCreateEditCategory = useCallback(
    (updatedItem) => {
      setIsLoading(true);
      setTimeout(() => {
        const updatedCategories = [...categories];
        if (editItem) {
          const index = updatedCategories.findIndex((cat) => cat.name === editItem.name);
          if (index !== -1) {
            updatedCategories[index] = { ...updatedCategories[index], ...updatedItem };
          }
        } else {
          if (updatedCategories.some((cat) => cat.name === updatedItem.name)) {
            alert(`Category "${updatedItem.name}" already exists`);
            setIsLoading(false);
            return;
          }
          updatedCategories.push({ ...updatedItem, id: generateId(), subcategories: [] });
        }
        setCategories(updatedCategories);
        setSelectedCategory(updatedCategories.find((cat) => cat.name === updatedItem.name) || null);
        setIsLoading(false);
        setIsSingleModalOpen(false);
        setIsBulkModalOpen(false);
      }, 500);
    },
    [categories, editItem]
  );

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categoriesPerSlide = 5;
  const totalCategorySlides = Math.ceil(filteredCategories.length / categoriesPerSlide);

  const goToCategorySlide = useCallback((index) => {
    if (categorySliderRef.current) {
      const cardWidth = categorySliderRef.current.querySelector('.group')?.offsetWidth || 0;
      categorySliderRef.current.scrollTo({
        left: index * cardWidth * categoriesPerSlide,
        behavior: 'smooth',
      });
      setCategoryCurrentSlide(index);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight animate-fade-in">
            Category
          </h1>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <h2 className="text-xl font-semibold text-gray-800">Add Categories</h2>
            <div className="flex gap-4">
              <input
                type="text"
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
                aria-label="Search categories"
              />
              <button
                onClick={() => openSingleModal()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition whitespace-nowrap"
                aria-label="Create new category"
              >
                Create Category
              </button>
              <button
                onClick={() => openBulkModal()}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition whitespace-nowrap"
                aria-label="Bulk upload categories"
              >
                Bulk Upload
              </button>
            </div>
          </div>
        </div>

        {/* Breadcrumbs */}
        <nav className="mb-8 flex flex-wrap items-center text-sm font-medium text-gray-500" aria-label="Breadcrumb">
          <span
            className="cursor-pointer hover:text-blue-600 transition"
            onClick={() => setSelectedCategory(null)}
            role="link"
            aria-label="Home"
          >
            Home
          </span>
          {selectedCategory && (
            <>
              <span className="mx-2">/</span>
              <span className="text-gray-700" aria-current="page">
                {selectedCategory.name}
              </span>
            </>
          )}
        </nav>

        {isLoading && (
          <div className="flex justify-center items-center py-12" aria-live="polite">
            <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
        )}

        {/* Categories */}
        {!selectedCategory && !isLoading && (
          <section className="mb-12 animate-fade-in" aria-labelledby="categories-heading">
            <h2 id="categories-heading" className="text-2xl font-semibold text-gray-800 mb-6">
              Categories
            </h2>
            {filteredCategories.length === 0 ? (
              <p className="text-gray-500" aria-live="polite">
                No categories found matching your search.
              </p>
            ) : (
              <div className="relative">
                <div
                  ref={categorySliderRef}
                  className="flex overflow-x-hidden scroll-smooth snap-x snap-mandatory touch-pan-x z-0"
                  style={{ scrollBehavior: 'smooth' }}
                  role="region"
                  aria-label="Category slider"
                >
                  {filteredCategories.map((category) => (
                    <div
                      key={category.id}
                      className="w-1/5 flex-shrink-0 snap-center px-2"
                    >
                      <div
                        className="p-6 border rounded-xl bg-white shadow-sm hover:shadow-md transition-all cursor-pointer group animate-slide-up"
                        onClick={() => handleCategoryClick(category)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleCategoryClick(category)}
                        aria-label={`View ${category.name}`}
                      >
                        <img
                          src={category.image}
                          alt={category.name}
                          className="w-24 h-24 object-contain mb-4 rounded-md"
                        />
                        <h3 className="text-lg font-medium text-gray-800 group-hover:text-blue-600 transition">
                          {category.name}
                        </h3>
                        <div className="mt-4 flex justify-between">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSingleModal(category);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            aria-label={`Edit ${category.name}`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {totalCategorySlides > 1 && (
                  <div className="absolute top-1/2 transform -translate-y-1/2 w-full flex justify-between px-4">
                    <button
                      onClick={() => goToCategorySlide(categoryCurrentSlide > 0 ? categoryCurrentSlide - 1 : 0)}
                      className="bg-gray-800 text-white p-2 rounded-full hover:bg-gray-600 transition"
                      aria-label="Previous category slide"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() =>
                        goToCategorySlide(
                          categoryCurrentSlide < totalCategorySlides - 1 ? categoryCurrentSlide + 1 : categoryCurrentSlide
                        )
                      }
                      className="bg-gray-800 text-white p-2 rounded-full hover:bg-gray-600 transition"
                      aria-label="Next category slide"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Category Details */}
        {selectedCategory && !isLoading && (
          <section className="mb-12 animate-fade-in" aria-labelledby="category-details-heading">
            <button
              className="mb-6 flex items-center text-blue-600 hover:text-blue-800 transition font-medium"
              onClick={handleBack}
              aria-label="Go back"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <h2 id="category-details-heading" className="text-3xl font-bold text-gray-900 mb-4">
                {selectedCategory.name}
              </h2>
              <img
                src={selectedCategory.image}
                alt={selectedCategory.name}
                className="w-48 h-48 object-contain rounded-xl mb-4"
              />
              <button
                onClick={() => openSingleModal(selectedCategory)}
                className="text-blue-600 hover:text-blue-800 text-sm"
                aria-label={`Edit ${selectedCategory.name}`}
              >
                Edit
              </button>
            </div>
          </section>
        )}

        {/* Modals */}
        <CreateSingleCategoryModal
          isOpen={isSingleModalOpen}
          onClose={() => setIsSingleModalOpen(false)}
          onSubmit={handleCreateEditCategory}
          item={editItem}
        />
        <BulkCreateCategoryModal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          onSubmit={handleCreateEditCategory}
        />
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.5s ease-out;
        }
        .animate-slide-up {
          animation: slideUp 0.5s ease-out;
        }
        .scroll-smooth {
          -webkit-overflow-scrolling: touch;
        }
        .snap-x {
          scroll-snap-type: x mandatory;
        }
        .snap-center {
          scroll-snap-align: center;
        }
        .touch-pan-x {
          -webkit-overflow-scrolling: touch;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .touch-pan-x::-webkit-scrollbar {
          display: none;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
      `}</style>
    </div>
  );
};

export default ExpenseCategoryPage;