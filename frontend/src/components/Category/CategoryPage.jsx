import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import img from '../../assets/MockUp.png';

// Utility function to generate a unique ID for products
const generateId = () => Math.floor(Math.random() * 1000000) + 10;

// Validate image uploads (JPEG/PNG/GIF, <2MB)
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

// API Key and Base URL
const API_KEY = process.env.REACT_APP_API_KEY || 'your-secure-api-key-here';
const API_BASE_URL = 'http://localhost:5000/api';

// Initial category data (empty)
const categoriesInitial = [];

// Modal for bulk uploading Categories, Subcategories, or Sub-Subcategories
const BulkCreateCategoryModal = ({ isOpen, onClose, onSubmit, level, selectedCategory, selectedSubcategory }) => {
  const [excelFile, setExcelFile] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleExcelChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/octet-stream',
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xls|xlsx|csv)$/i)) {
      setError('Please upload a valid Excel or CSV file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }
    setError('');
    setExcelFile(file);
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!excelFile) {
        setError('Please select an Excel or CSV file');
        return;
      }
      if (level === 'Subcategory' && !selectedCategory) {
        setError('Please select a category before uploading subcategories');
        return;
      }
      if (level === 'Sub-Subcategory' && (!selectedCategory || !selectedSubcategory)) {
        setError('Please select a category and subcategory before uploading sub-subcategories');
        return;
      }
      setIsSubmitting(true);
      try {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const wb = XLSX.read(evt.target.result, {
              type: excelFile.type === 'text/csv' ? 'string' : 'array',
              raw: excelFile.type === 'text/csv',
            });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            // Validate column names
            const expectedNameColumns = [
              `${level} Name`,
              `${level.toLowerCase()} name`,
              level,
              level.toLowerCase(),
              'Name',
              'name',
              `${level}Name`,
              `${level.toLowerCase()}Name`,
            ];
            const headers = Object.keys(rows[0] || {});
            const hasValidNameColumn = headers.some((header) => expectedNameColumns.includes(header));

            if (!hasValidNameColumn) {
              setError(
                `Invalid file format. Expected a column named one of: ${expectedNameColumns.join(
                  ', '
                )}. Found: ${headers.join(', ') || 'none'}`
              );
              setIsSubmitting(false);
              return;
            }

            const items = rows
              .map((row, index) => {
                const name = (
                  row[`${level} Name`] ||
                  row[`${level.toLowerCase()} name`] ||
                  row[level] ||
                  row[level.toLowerCase()] ||
                  row['Name'] ||
                  row['name'] ||
                  row[`${level}Name`] ||
                  row[`${level.toLowerCase()}Name`]
                )?.toString().trim();
                if (!name || name.length === 0) {
                  console.warn(`Row ${index + 2}: Invalid or missing name`, row);
                  return null;
                }
                const image = row['Image'] || row['image'] || img;
                const features = (row['Features'] || row['features'] || '')
                  .split(',')
                  .map((f) => f.trim())
                  .filter(Boolean);
                return {
                  name,
                  image,
                  features,
                  subcategories: level === 'Category' ? [] : undefined,
                  subSubcategories: level === 'Subcategory' ? [] : undefined,
                  products: level === 'Sub-Subcategory' ? [] : undefined,
                  parentId:
                    level === 'Subcategory'
                      ? selectedCategory?._id
                      : level === 'Sub-Subcategory'
                      ? selectedSubcategory?._id
                      : null,
                };
              })
              .filter(Boolean);

            if (items.length === 0) {
              setError(
                `No valid ${level.toLowerCase()} entries found. Ensure the '${expectedNameColumns[0]}' column contains non-empty names.`
              );
              setIsSubmitting(false);
              return;
            }

            // Submit items to API
            for (const item of items) {
              const formData = new FormData();
              formData.append('name', item.name);
              formData.append('features', JSON.stringify(item.features));
              if (item.image && item.image !== img) {
                formData.append('image', item.image);
              }

              console.log('Sending formData:', { name: item.name }); // Debug log

              let url;
              if (level === 'Category') {
                url = `${API_BASE_URL}/categories`;
              } else if (level === 'Subcategory') {
                url = `${API_BASE_URL}/categories/${selectedCategory._id}/subcategories`;
              } else {
                url = `${API_BASE_URL}/categories/${selectedCategory._id}/subcategories/${selectedSubcategory._id}/sub-subcategories`;
              }
              const response = await fetch(url, {
                method: 'POST',
                headers: {
                  'X-API-Key': API_KEY,
                },
                body: formData,
              });

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                  errorData.message ||
                    `Failed to create ${level.toLowerCase()} for item "${item.name || 'unknown'}"`
                );
              }
            }

            onSubmit(items);
            setExcelFile(null);
            setIsSubmitting(false);
            onClose();
          } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to process Excel/CSV file');
            setIsSubmitting(false);
          }
        };
        reader.onerror = () => {
          setError('Error reading file');
          setIsSubmitting(false);
        };
        if (excelFile.type === 'text/csv') reader.readAsText(excelFile);
        else reader.readAsArrayBuffer(excelFile);
      } catch (err) {
        console.error(err);
        setError('Failed to upload items');
        setIsSubmitting(false);
      }
    },
    [excelFile, level, selectedCategory, selectedSubcategory, onSubmit, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Bulk Upload {level}s</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="excel-upload" className="block text-sm font-medium text-gray-700 mb-1">
            Upload Excel/CSV File
          </label>
          <input
            id="excel-upload"
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={handleExcelChange}
            className="w-full border rounded-md px-3 py-2 mb-4"
            aria-label={`Upload Excel or CSV file for bulk ${level} creation`}
          />
          <p className="text-xs text-gray-500 mb-4">
            File should have columns: '{level} Name' or 'Name' (required), 'Image' (optional), 'Features' (optional, comma-separated)
          </p>
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
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              disabled={isSubmitting}
              aria-label={`Upload ${level}s`}
            >
              {isSubmitting ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal for creating or editing a single Category, Subcategory, or Sub-Subcategory
const CreateSingleCategoryModal = ({ isOpen, onClose, onSubmit, item, categories, level, selectedCategory, selectedSubcategory }) => {
  const [name, setName] = useState(item?.name || '');
  const [imagePreview, setImagePreview] = useState(item?.image || null);
  const [features, setFeatures] = useState(item?.features || ['']);
  const [selectedParentId, setSelectedParentId] = useState(
    item?.parentId || (level === 1 && selectedCategory?._id) || (level === 2 && selectedSubcategory?._id) || ''
  );
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [image, setImage] = useState(null);

  const handleImageChange = useCallback((e) => {
    const file = e.target.files[0];
    if (validateImage(file, setError)) {
      setError('');
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleFeatureChange = useCallback((index, value) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    setFeatures(newFeatures);
  }, [features]);

  const addFeature = useCallback(() => {
    setFeatures([...features, '']);
  }, [features]);

  const removeFeature = useCallback((index) => {
    setFeatures(features.filter((_, i) => i !== index));
  }, [features]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      setError('');
      if (!name.trim()) {
        setError('Name is required');
        setIsSubmitting(false);
        return;
      }
      if (level > 0 && !selectedParentId) {
        setError('Parent category is required');
        setIsSubmitting(false);
        return;
      }
      if (features.some((f) => !f.trim())) {
        setError('All features must be filled or removed');
        setIsSubmitting(false);
        return;
      }

      try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('features', JSON.stringify(features.filter((f) => f.trim())));
        if (image) {
          formData.append('image', image);
        }

        let url;
        if (level === 0) {
          url = `${API_BASE_URL}/categories`;
        } else if (level === 1) {
          url = `${API_BASE_URL}/categories/${selectedParentId}/subcategories`;
        } else {
          url = `${API_BASE_URL}/categories/${selectedCategory._id}/subcategories/${selectedParentId}/sub-subcategories`;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'X-API-Key': API_KEY,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to create ${level === 0 ? 'category' : level === 1 ? 'subcategory' : 'sub-subcategory'}`);
        }

        const updatedCategory = await response.json();
        onSubmit({
          name,
          image: imagePreview || item?.image || img,
          features: features.filter((f) => f.trim()),
          subcategories: item?.subcategories || (level === 0 ? [] : undefined),
          subSubcategories: item?.subSubcategories || (level === 1 ? [] : undefined),
          products: item?.products || (level === 2 ? [] : undefined),
          parentId: level > 0 ? selectedParentId : null,
          _id: updatedCategory._id || updatedCategory.subcategories?.slice(-1)[0]?._id || updatedCategory.subSubcategories?.slice(-1)[0]?._id,
        });
        setIsSubmitting(false);
        onClose();
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to save item');
        setIsSubmitting(false);
      }
    },
    [name, image, imagePreview, features, selectedParentId, item, level, selectedCategory, selectedSubcategory, onSubmit, onClose]
  );

  if (!isOpen) return null;

  const parentOptions = level === 0 ? [] : categories.flatMap((cat) => {
    if (level === 1) return [{ name: cat.name, id: cat._id }];
    if (level === 2) {
      return (cat.subcategories || []).map((subcat) => ({ name: subcat.name, id: subcat._id }));
    }
    return [];
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {item ? 'Edit' : 'Create'} {level === 0 ? 'Category' : level === 1 ? 'Subcategory' : 'Sub-Subcategory'}
        </h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {level > 0 && (
            <>
              <label htmlFor="parent-category" className="block text-sm font-medium text-gray-700 mb-1">
                Parent {level === 1 ? 'Category' : 'Subcategory'}
              </label>
              <select
                id="parent-category"
                value={selectedParentId}
                onChange={(e) => setSelectedParentId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 mb-4 focus:ring-2 focus:ring-blue-500"
                required
                aria-required="true"
              >
                <option value="">Select Parent</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <label htmlFor={`${level}-name`} className="block text-sm font-medium text-gray-700 mb-1">
            {level === 0 ? 'Category' : level === 1 ? 'Subcategory' : 'Sub-Subcategory'} Name
          </label>
          <input
            id={`${level}-name`}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            className="w-full border rounded-md px-3 py-2 mb-4 focus:ring-2 focus:ring-blue-500"
            required
            aria-required="true"
          />
          <label htmlFor={`${level}-image`} className="block text-sm font-medium text-gray-700 mb-1">
            Image
          </label>
          <input
            id={`${level}-image`}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            onChange={handleImageChange}
            className="w-full border rounded-md px-3 py-2 mb-4"
            aria-label={`Upload image for ${level === 0 ? 'category' : level === 1 ? 'subcategory' : 'sub-subcategory'}`}
          />
          {imagePreview && (
            <img src={imagePreview} alt="Preview" className="w-32 h-32 object-contain rounded-md mb-4" />
          )}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Features</label>
            {features.map((feature, index) => (
              <div key={index} className="flex items-center mb-2">
                <input
                  type="text"
                  value={feature}
                  onChange={(e) => handleFeatureChange(index, e.target.value)}
                  className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  aria-label={`Feature ${index + 1}`}
                />
                {features.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    className="ml-2 text-red-600 hover:text-red-800"
                    aria-label={`Remove feature ${index + 1}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addFeature}
              className="text-blue-600 hover:text-blue-800 text-sm"
              aria-label="Add new feature"
            >
              + Add Feature
            </button>
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={isSubmitting}
              aria-label={item ? `Update ${level === 0 ? 'category' : level === 1 ? 'subcategory' : 'sub-subcategory'}` : `Create ${level === 0 ? 'category' : level === 1 ? 'subcategory' : 'sub-subcategory'}`}
            >
              {isSubmitting ? 'Saving...' : item ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ProductCard for displaying a product
const ProductCard = ({ product, onClick, onEdit }) => (
  <div
    className="group relative border rounded-xl p-5 bg-white shadow-sm hover:shadow-2xl transition-all duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1 animate-slide-up"
    onClick={() => onClick(product)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onClick(product)}
    aria-label={`View ${product.name}`}
  >
    <div className="relative">
      <img
        src={product.image}
        alt={product.name}
        className="w-full h-40 object-contain rounded-lg mb-4 transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
    </div>
    <h4 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-1">
      {product.name}
    </h4>
    <p className="mt-2 text-sm text-gray-500 line-clamp-2">{product.description}</p>
    {product.features?.length > 0 && (
      <p className="mt-2 text-sm text-gray-500 line-clamp-1">
        Features: {product.features.slice(0, 3).join(', ')}
        {product.features.length > 3 ? '...' : ''}
      </p>
    )}
    <div className="mt-3 flex justify-between items-center">
      <p className="font-bold text-green-600 text-lg">₹{product.price}</p>
      <button
        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-700"
        aria-label={`View details of ${product.name}`}
      >
        View
      </button>
    </div>
    <div className="mt-4 flex justify-between">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit(product);
        }}
        className="text-blue-600 hover:text-blue-800 text-sm"
        aria-label={`Edit ${product.name}`}
      >
        Edit
      </button>
    </div>
    <div className="absolute top-2 right-2 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
      In Stock
    </div>
  </div>
);

// ProductDetails for showing detailed product information
const ProductDetails = ({ product, onBack, relatedProducts, onRelatedProductClick, onEdit }) => (
  <div className="max-w-5xl mx-auto animate-fade-in">
    <button
      className="mb-6 flex items-center text-blue-600 hover:text-blue-800 transition font-medium"
      onClick={onBack}
      aria-label="Go back"
    >
      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-8 rounded-2xl shadow-lg">
      <div className="relative">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-96 object-contain rounded-xl transition-transform duration-300 hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent rounded-xl"></div>
      </div>
      <div>
        <h2 className="text-3xl font-bold text-gray-900">{product.name}</h2>
        <p className="mt-3 text-gray-600 leading-relaxed">{product.description}</p>
        <p className="mt-4 font-bold text-green-600 text-2xl">₹{product.price}</p>
        <ul className="mt-6 space-y-3">
          {product.features.map((feature, idx) => (
            <li key={idx} className="flex items-center text-gray-700">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              {feature}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex space-x-4">
          <button
            className="bg-green-600 text-white py-3 px-8 rounded-md hover:bg-green-700 transition text-lg"
            aria-label={`Add ${product.name} to cart`}
          >
            Add to Cart
          </button>
          <button
            className="border border-gray-300 text-gray-700 py-3 px-8 rounded-md hover:bg-gray-100 transition"
            aria-label={`Add ${product.name} to wishlist`}
          >
            Add to Wishlist
          </button>
          <button
            onClick={() => onEdit(product)}
            className="text-blue-600 hover:text-blue-800 text-sm"
            aria-label={`Edit ${product.name}`}
          >
            Edit
          </button>
        </div>
      </div>
    </div>
    {relatedProducts.length > 0 && (
      <div className="mt-12">
        <h3 className="text-2xl font-semibold text-gray-800 mb-6">Related Products</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {relatedProducts.map((relatedProduct) => (
            <ProductCard
              key={relatedProduct.id}
              product={relatedProduct}
              onClick={onRelatedProductClick}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>
    )}
  </div>
);

// Modal for creating or editing a product
const CreateEditProductModal = ({ isOpen, onClose, item, onSubmit }) => {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [price, setPrice] = useState(item?.price || '');
  const [features, setFeatures] = useState(item?.features || ['']);
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
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleFeatureChange = useCallback((index, value) => {
    const newFeatures = [...features];
    newFeatures[index] = value;
    setFeatures(newFeatures);
  }, [features]);

  const addFeature = useCallback(() => {
    setFeatures([...features, '']);
  }, [features]);

  const removeFeature = useCallback((index) => {
    setFeatures(features.filter((_, i) => i !== index));
  }, [features]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      if (!description.trim()) {
        setError('Description is required');
        return;
      }
      if (!price || isNaN(price) || price <= 0) {
        setError('Please enter a valid price');
        return;
      }
      if (features.some((f) => !f.trim())) {
        setError('All features must be filled');
        return;
      }
      setIsSubmitting(true);

      try {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description);
        formData.append('price', parseFloat(price));
        formData.append('features', JSON.stringify(features.filter((f) => f.trim())));
        if (image) {
          formData.append('image', image);
        }

        const response = await fetch(
          `${API_BASE_URL}/categories/${item?.categoryId}/subcategories/${item?.subcategoryId}/sub-subcategories/${item?.subSubcategoryId}/products`,
          {
            method: 'POST',
            headers: {
              'X-API-Key': API_KEY,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to create product');
        }

        const updatedCategory = await response.json();
        onSubmit({
          id: item?.id || generateId(),
          name,
          description,
          price: parseFloat(price),
          features: features.filter((f) => f.trim()),
          image: imagePreview || item?.image || img,
          categoryId: item?.categoryId,
          subcategoryId: item?.subcategoryId,
          subSubcategoryId: item?.subSubcategoryId,
        });
        setName('');
        setDescription('');
        setPrice('');
        setFeatures(['']);
        setImage(null);
        setImagePreview(null);
        setError('');
        setIsSubmitting(false);
        onClose();
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to save product');
        setIsSubmitting(false);
      }
    },
    [name, description, price, features, image, imagePreview, item, onSubmit, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl p-8 max-w-lg w-full shadow-2xl overflow-y-auto max-h-[80vh] animate-slide-up">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {item ? 'Edit' : 'Create New'} Product
        </h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="product-name"
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
          <div className="mb-4">
            <label htmlFor="product-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="product-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError('');
              }}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="4"
              required
              aria-required="true"
            ></textarea>
          </div>
          <div className="mb-4">
            <label htmlFor="product-price" className="block text-sm font-medium text-gray-700 mb-1">
              Price (₹)
            </label>
            <input
              id="product-price"
              type="number"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setError('');
              }}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              step="0.01"
              required
              aria-required="true"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Features</label>
            {features.map((feature, index) => (
              <div key={index} className="flex items-center mb-2">
                <input
                  type="text"
                  value={feature}
                  onChange={(e) => handleFeatureChange(index, e.target.value)}
                  className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  aria-required="true"
                  aria-label={`Feature ${index + 1}`}
                />
                {features.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeFeature(index)}
                    className="ml-2 text-red-600 hover:text-red-800"
                    aria-label={`Remove feature ${index + 1}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addFeature}
              className="text-blue-600 hover:text-blue-800 text-sm"
              aria-label="Add new feature"
            >
              + Add Feature
            </button>
          </div>
          <div className="mb-6">
            <label htmlFor="product-image" className="block text-sm font-medium text-gray-700 mb-1">
              Image
            </label>
            <input
              id="product-image"
              type="file"
              accept="image/jpeg,image/png,image/gif"
              onChange={handleImageChange}
              className="w-full border rounded-md px-3 py-2"
              aria-label="Upload product image"
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
              aria-label={item ? 'Update product' : 'Create product'}
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

// Main component for the expense category page
const ExpenseCategoryPage = () => {
  const [categories, setCategories] = useState(categoriesInitial);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [selectedSubSubcategory, setSelectedSubSubcategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [modalLevel, setModalLevel] = useState('Category');
  const [editItem, setEditItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('name-asc');
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [error, setError] = useState('');
  const categorySliderRef = useRef(null);
  const productSliderRef = useRef(null);
  const [categoryCurrentSlide, setCategoryCurrentSlide] = useState(0);
  const [productCurrentSlide, setProductCurrentSlide] = useState(0);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE_URL}/categories`, {
          headers: {
            'X-API-Key': API_KEY,
          },
        });
        if (!response.ok) {
          throw new Error('Failed to fetch categories');
        }
        const data = await response.json();
        setCategories(data);
      } catch (err) {
        console.error('Error fetching categories:', err);
        setError('Failed to load categories');
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategories();
  }, []);

  // Function to download Excel file for Categories
  const downloadCategoryExcel = useCallback(() => {
    const data = categories.map((category) => ({
      'Category Name': category.name,
      Image: category.image,
      Features: category.features.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Categories');
    XLSX.writeFile(wb, 'categories.xlsx');
  }, [categories]);

  // Function to download Excel file for Subcategories
  const downloadSubcategoryExcel = useCallback(() => {
    if (!selectedCategory) return;
    const data = (selectedCategory.subcategories || []).map((subcategory) => ({
      'Subcategory Name': subcategory.name,
      Image: subcategory.image,
      Features: subcategory.features.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subcategories');
    XLSX.writeFile(wb, `${selectedCategory.name}_subcategories.xlsx`);
  }, [selectedCategory]);

  // Function to download Excel file for Sub-Subcategories
  const downloadSubSubcategoryExcel = useCallback(() => {
    if (!selectedSubcategory) return;
    const data = (selectedSubcategory.subSubcategories || []).map((subSubcategory) => ({
      'Sub-Subcategory Name': subSubcategory.name,
      Image: subSubcategory.image,
      Features: subSubcategory.features.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sub-Subcategories');
    XLSX.writeFile(wb, `${selectedSubcategory.name}_sub-subcategories.xlsx`);
  }, [selectedSubcategory]);

  const handleCategoryClick = useCallback((category) => {
    setIsLoading(true);
    setTimeout(() => {
      setSelectedCategory(category);
      setSelectedSubcategory(null);
      setSelectedSubSubcategory(null);
      setSelectedProduct(null);
      setIsLoading(false);
    }, 300);
  }, []);

  const handleSubcategoryClick = useCallback((subcategory) => {
    setIsLoading(true);
    setTimeout(() => {
      setSelectedSubcategory(subcategory);
      setSelectedSubSubcategory(null);
      setSelectedProduct(null);
      setIsLoading(false);
    }, 300);
  }, []);

  const handleSubSubcategoryClick = useCallback((subSubcategory) => {
    setIsLoading(true);
    setTimeout(() => {
      setSelectedSubSubcategory(subSubcategory);
      setSelectedProduct(null);
      setIsLoading(false);
    }, 300);
  }, []);

  const handleProductClick = useCallback((product) => {
    setIsLoading(true);
    setTimeout(() => {
      setSelectedProduct(product);
      setIsLoading(false);
    }, 300);
  }, []);

  const handleBack = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      if (selectedProduct) {
        setSelectedProduct(null);
      } else if (selectedSubSubcategory) {
        setSelectedSubSubcategory(null);
      } else if (selectedSubcategory) {
        setSelectedSubcategory(null);
      } else if (selectedCategory) {
        setSelectedCategory(null);
      }
      setIsLoading(false);
    }, 300);
  }, [selectedProduct, selectedSubSubcategory, selectedSubcategory, selectedCategory]);

  const getRelatedProducts = useCallback((product) => {
    if (!selectedSubSubcategory) return [];
    return selectedSubSubcategory.products.filter((p) => p.id !== product.id);
  }, [selectedSubSubcategory]);

  const openCreateEditModal = useCallback((level, item = null) => {
    setModalLevel(level === 0 ? 'Category' : level === 1 ? 'Subcategory' : 'Sub-Subcategory');
    setEditItem(item);
    setIsSingleModalOpen(true);
    setIsDropdownOpen(false);
  }, []);

  const openBulkUploadModal = useCallback((level) => {
    setModalLevel(level);
    setIsBulkModalOpen(true);
    setIsDropdownOpen(false);
  }, []);

  const openProductModal = useCallback((item = null) => {
    setEditItem({
      ...item,
      categoryId: selectedCategory?._id,
      subcategoryId: selectedSubcategory?._id,
      subSubcategoryId: selectedSubSubcategory?._id,
    });
    setIsProductModalOpen(true);
  }, [selectedCategory, selectedSubcategory, selectedSubSubcategory]);

  const handleCreateEditCategory = useCallback(
    (newItem) => {
      setCategories((prev) => {
        const newCategories = [...prev];
        if (Array.isArray(newItem)) {
          newItem.forEach((item) => {
            newCategories.push({
              ...item,
              _id: item._id || generateId().toString(),
              subcategories: item.subcategories || [],
            });
          });
        } else {
          const index = newCategories.findIndex((cat) => cat._id === newItem._id);
          if (index !== -1) {
            newCategories[index] = { ...newCategories[index], ...newItem };
          } else {
            newCategories.push({
              ...newItem,
              _id: newItem._id || generateId().toString(),
              subcategories: newItem.subcategories || [],
            });
          }
        }
        return newCategories;
      });
      setIsSingleModalOpen(false);
      setIsBulkModalOpen(false);
      if (!Array.isArray(newItem)) {
        setSelectedCategory({ ...newItem, subcategories: newItem.subcategories || [] });
      }
    },
    []
  );

  const handleCreateEditSubcategory = useCallback(
    (newItem) => {
      if (!selectedCategory) {
        setError('No category selected');
        return;
      }
      setCategories((prev) => {
        const newCategories = prev.map((cat) => {
          if (cat._id === selectedCategory._id) {
            const subcategories = [...(cat.subcategories || [])];
            if (Array.isArray(newItem)) {
              newItem.forEach((item) => {
                subcategories.push({
                  ...item,
                  _id: item._id || generateId().toString(),
                  subSubcategories: item.subSubcategories || [],
                });
              });
            } else {
              const index = subcategories.findIndex((sub) => sub._id === newItem._id);
              if (index !== -1) {
                subcategories[index] = { ...subcategories[index], ...newItem };
              } else {
                subcategories.push({
                  ...newItem,
                  _id: newItem._id || generateId().toString(),
                  subSubcategories: newItem.subSubcategories || [],
                });
              }
            }
            return { ...cat, subcategories };
          }
          return cat;
        });
        return newCategories;
      });
      setSelectedCategory((prev) => ({
        ...prev,
        subcategories: Array.isArray(newItem)
          ? [...(prev.subcategories || []), ...newItem.map((item) => ({ ...item, subSubcategories: item.subSubcategories || [] }))]
          : [...(prev.subcategories || []), { ...newItem, subSubcategories: newItem.subSubcategories || [] }],
      }));
      if (!Array.isArray(newItem)) {
        setSelectedSubcategory({ ...newItem, subSubcategories: newItem.subSubcategories || [] });
      }
      setIsSingleModalOpen(false);
      setIsBulkModalOpen(false);
    },
    [selectedCategory]
  );

  const handleCreateEditSubSubcategory = useCallback(
    (newItem) => {
      if (!selectedCategory || !selectedSubcategory) {
        setError('No category or subcategory selected');
        return;
      }
      setCategories((prev) => {
        const newCategories = prev.map((cat) => {
          if (cat._id === selectedCategory._id) {
            const subcategories = cat.subcategories.map((sub) => {
              if (sub._id === selectedSubcategory._id) {
                const subSubcategories = [...(sub.subSubcategories || [])];
                if (Array.isArray(newItem)) {
                  newItem.forEach((item) => {
                    subSubcategories.push({
                      ...item,
                      _id: item._id || generateId().toString(),
                      products: item.products || [],
                    });
                  });
                } else {
                  const index = subSubcategories.findIndex((subSub) => subSub._id === newItem._id);
                  if (index !== -1) {
                    subSubcategories[index] = { ...subSubcategories[index], ...newItem };
                  } else {
                    subSubcategories.push({
                      ...newItem,
                      _id: newItem._id || generateId().toString(),
                      products: newItem.products || [],
                    });
                  }
                }
                return { ...sub, subSubcategories };
              }
              return sub;
            });
            return { ...cat, subcategories };
          }
          return cat;
        });
        return newCategories;
      });
      setSelectedCategory((prev) => ({
        ...prev,
        subcategories: prev.subcategories.map((sub) =>
          sub._id === selectedSubcategory._id
            ? {
                ...sub,
                subSubcategories: Array.isArray(newItem)
                  ? [...(sub.subSubcategories || []), ...newItem.map((item) => ({ ...item, products: item.products || [] }))]
                  : [...(sub.subSubcategories || []), { ...newItem, products: newItem.products || [] }],
              }
            : sub
        ),
      }));
      setSelectedSubcategory((prev) => ({
        ...prev,
        subSubcategories: Array.isArray(newItem)
          ? [...(prev.subSubcategories || []), ...newItem.map((item) => ({ ...item, products: item.products || [] }))]
          : [...(prev.subSubcategories || []), { ...newItem, products: newItem.products || [] }],
      }));
      if (!Array.isArray(newItem)) {
        setSelectedSubSubcategory({ ...newItem, products: newItem.products || [] });
      }
      setIsSingleModalOpen(false);
      setIsBulkModalOpen(false);
    },
    [selectedCategory, selectedSubcategory]
  );

  const handleCreateEditProduct = useCallback(
    (newProduct) => {
      if (!selectedCategory || !selectedSubcategory || !selectedSubSubcategory) {
        setError('No category, subcategory, or sub-subcategory selected');
        return;
      }
      setCategories((prev) => {
        const newCategories = prev.map((cat) => {
          if (cat._id === selectedCategory._id) {
            const subcategories = cat.subcategories.map((sub) => {
              if (sub._id === selectedSubcategory._id) {
                const subSubcategories = sub.subSubcategories.map((subSub) => {
                  if (subSub._id === selectedSubSubcategory._id) {
                    const products = [...(subSub.products || [])];
                    const index = products.findIndex((p) => p.id === newProduct.id);
                    if (index !== -1) {
                      products[index] = newProduct;
                    } else {
                      products.push(newProduct);
                    }
                    return { ...subSub, products };
                  }
                  return subSub;
                });
                return { ...sub, subSubcategories };
              }
              return sub;
            });
            return { ...cat, subcategories };
          }
          return cat;
        });
        return newCategories;
      });
      setSelectedCategory((prev) => ({
        ...prev,
        subcategories: prev.subcategories.map((sub) =>
          sub._id === selectedSubcategory._id
            ? {
                ...sub,
                subSubcategories: sub.subSubcategories.map((subSub) =>
                  subSub._id === selectedSubSubcategory._id
                    ? { ...subSub, products: [...(subSub.products || []), newProduct] }
                    : subSub
                ),
              }
            : sub
        ),
      }));
      setSelectedSubcategory((prev) => ({
        ...prev,
        subSubcategories: prev.subSubcategories.map((subSub) =>
          subSub._id === selectedSubSubcategory._id
            ? { ...subSub, products: [...(subSub.products || []), newProduct] }
            : subSub
        ),
      }));
      setSelectedSubSubcategory((prev) => ({
        ...prev,
        products: [...(prev.products || []), newProduct],
      }));
      setIsProductModalOpen(false);
    },
    [selectedCategory, selectedSubcategory, selectedSubSubcategory]
  );

  const filteredCategories = useMemo(() => {
    if (!searchQuery) return categories;
    return categories.filter((cat) =>
      cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cat.subcategories || []).some((subcat) =>
        subcat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (subcat.subSubcategories || []).some((subSubcat) =>
          subSubcat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (subSubcat.products || []).some(
            (product) =>
              product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              product.description.toLowerCase().includes(searchQuery.toLowerCase())
          )
        )
      )
    );
  }, [categories, searchQuery]);

  const sortedProducts = useMemo(() => {
    if (!selectedSubSubcategory) return [];
    const products = [...(selectedSubSubcategory.products || [])];
    switch (sortOption) {
      case 'name-asc':
        return products.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return products.sort((a, b) => b.name.localeCompare(b.name));
      case 'price-asc':
        return products.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return products.sort((a, b) => b.price - a.price);
      default:
        return products;
    }
  }, [selectedSubSubcategory, sortOption]);

  const categoriesPerSlide = 5;
  const productsPerSlide = 5;
  const totalCategorySlides = Math.ceil(filteredCategories.length / categoriesPerSlide);
  const totalProductSlides = Math.ceil(sortedProducts.length / productsPerSlide);

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

  const goToProductSlide = useCallback((index) => {
    if (productSliderRef.current) {
      const cardWidth = productSliderRef.current.querySelector('.group')?.offsetWidth || 0;
      productSliderRef.current.scrollTo({
        left: index * cardWidth * productsPerSlide,
        behavior: 'smooth',
      });
      setProductCurrentSlide(index);
    }
  }, []);

  const startBulkUpload = useCallback(() => {
    setIsDropdownOpen((prev) => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight animate-fade-in">
            Category
          </h1>
          <div className="flex gap-4 flex-wrap">
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
              aria-label="Search products"
            />
            <button
              onClick={() => openCreateEditModal(0)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition whitespace-nowrap"
              aria-label="Create new category"
            >
              Create Category
            </button>
            <button
              onClick={downloadCategoryExcel}
              className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition whitespace-nowrap disabled:opacity-50"
              aria-label="Download categories Excel"
              disabled={categories.length === 0}
            >
              Download Excel
            </button>
            <div className="relative">
              <button
                onClick={startBulkUpload}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition whitespace-nowrap"
                aria-label="Start bulk upload"
                aria-haspopup="true"
                aria-expanded={isDropdownOpen}
              >
                More Bulk Upload
              </button>
              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-md shadow-lg z-50" role="menu">
                  <button
                    onClick={() => openBulkUploadModal('Category')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    role="menuitem"
                    aria-label="Bulk upload categories"
                  >
                    Category
                  </button>
                  <button
                    onClick={() => openBulkUploadModal('Subcategory')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    role="menuitem"
                    aria-label="Bulk upload subcategories"
                  >
                    Subcategory
                  </button>
                  <button
                    onClick={() => openBulkUploadModal('Sub-Subcategory')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    role="menuitem"
                    aria-label="Bulk upload sub-subcategories"
                  >
                    Sub-Subcategory
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="mb-8 flex flex-wrap items-center text-sm font-medium text-gray-500" aria-label="Breadcrumb">
          <span
            className="cursor-pointer hover:text-blue-600 transition"
            onClick={() => {
              setSelectedCategory(null);
              setSelectedSubcategory(null);
              setSelectedSubSubcategory(null);
              setSelectedProduct(null);
            }}
            role="link"
            aria-label="Home"
          >
            Home
          </span>
          {selectedCategory && (
            <>
              <span className="mx-2">/</span>
              <span
                className="cursor-pointer hover:text-blue-600 transition"
                onClick={() => {
                  setSelectedSubcategory(null);
                  setSelectedSubSubcategory(null);
                  setSelectedProduct(null);
                }}
                role="link"
                aria-label={selectedCategory.name}
              >
                {selectedCategory.name}
              </span>
            </>
          )}
          {selectedSubcategory && (
            <>
              <span className="mx-2">/</span>
              <span
                className="cursor-pointer hover:text-blue-600 transition"
                onClick={() => {
                  setSelectedSubSubcategory(null);
                  setSelectedProduct(null);
                }}
                role="link"
                aria-label={selectedSubcategory.name}
              >
                {selectedSubcategory.name}
              </span>
            </>
          )}
          {selectedSubSubcategory && !selectedProduct && (
            <>
              <span className="mx-2">/</span>
              <span className="text-gray-700" aria-current="page">
                {selectedSubSubcategory.name}
              </span>
            </>
          )}
          {selectedProduct && (
            <>
              <span className="mx-2">/</span>
              <span className="text-gray-700" aria-current="page">
                {selectedProduct.name}
              </span>
            </>
          )}
        </nav>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm" role="alert">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center my-8">
            <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        )}

        {!isLoading && !selectedCategory && (
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">Categories</h2>
            {filteredCategories.length === 0 ? (
              <p className="text-gray-500">No categories found.</p>
            ) : (
              <>
                <div ref={categorySliderRef} className="flex overflow-x-auto space-x-4 pb-4 scrollbar-hide">
                  {filteredCategories.map((category) => (
                    <div
                      key={category._id}
                      className="group min-w-[200px] border rounded-xl p-4 bg-white shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer animate-slide-up"
                      onClick={() => handleCategoryClick(category)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleCategoryClick(category)}
                      aria-label={`View ${category.name}`}
                    >
                      <div className="relative">
                        <img
                          src={category.image || img}
                          alt={category.name}
                          className="w-full h-32 object-contain rounded-lg mb-3 transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                        {category.name}
                      </h3>
                      {category.features?.length > 0 && (
                        <p className="mt-2 text-sm text-gray-500 line-clamp-1">
                          {category.features.slice(0, 3).join(', ')}
                          {category.features.length > 3 ? '...' : ''}
                        </p>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateEditModal(0, category);
                        }}
                        className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                        aria-label={`Edit ${category.name}`}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
                {totalCategorySlides > 1 && (
                  <div className="flex justify-center mt-4 space-x-2">
                    {Array.from({ length: totalCategorySlides }).map((_, index) => (
                      <button
                        key={index}
                        className={`w-3 h-3 rounded-full ${categoryCurrentSlide === index ? 'bg-blue-600' : 'bg-gray-300'}`}
                        onClick={() => goToCategorySlide(index)}
                        aria-label={`Go to category slide ${index + 1}`}
                      ></button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!isLoading && selectedCategory && !selectedSubcategory && (
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">{selectedCategory.name} Subcategories</h2>
            <button
              onClick={() => openCreateEditModal(1)}
              className="mb-6 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              aria-label="Create new subcategory"
            >
              Create Subcategory
            </button>
            <button
              onClick={downloadSubcategoryExcel}
              className="ml-4 mb-6 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition disabled:opacity-50"
              aria-label="Download subcategories Excel"
              disabled={!(selectedCategory.subcategories?.length > 0)}
            >
              Download Excel
            </button>
            {selectedCategory.subcategories?.length === 0 ? (
              <p className="text-gray-500">No subcategories found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {selectedCategory.subcategories.map((subcategory) => (
                  <div
                    key={subcategory._id}
                    className="group border rounded-xl p-4 bg-white shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer animate-slide-up"
                    onClick={() => handleSubcategoryClick(subcategory)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubcategoryClick(subcategory)}
                    aria-label={`View ${subcategory.name}`}
                  >
                    <div className="relative">
                      <img
                        src={subcategory.image || img}
                        alt={subcategory.name}
                        className="w-full h-32 object-contain rounded-lg mb-3 transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                      {subcategory.name}
                    </h3>
                    {subcategory.features?.length > 0 && (
                      <p className="mt-2 text-sm text-gray-500 line-clamp-1">
                        {subcategory.features.slice(0, 3).join(', ')}
                        {subcategory.features.length > 3 ? '...' : ''}
                      </p>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateEditModal(1, subcategory);
                      }}
                      className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                      aria-label={`Edit ${subcategory.name}`}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isLoading && selectedSubcategory && !selectedSubSubcategory && (
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">{selectedSubcategory.name} Sub-Subcategories</h2>
            <button
              onClick={() => openCreateEditModal(2)}
              className="mb-6 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              aria-label="Create new sub-subcategory"
            >
              Create Sub-Subcategory
            </button>
            <button
              onClick={downloadSubSubcategoryExcel}
              className="ml-4 mb-6 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition disabled:opacity-50"
              aria-label="Download sub-subcategories Excel"
              disabled={!(selectedSubcategory.subSubcategories?.length > 0)}
            >
              Download Excel
            </button>
            {selectedSubcategory.subSubcategories?.length === 0 ? (
              <p className="text-gray-500">No sub-subcategories found.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {selectedSubcategory.subSubcategories.map((subSubcategory) => (
                  <div
                    key={subSubcategory._id}
                    className="group border rounded-xl p-4 bg-white shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer animate-slide-up"
                    onClick={() => handleSubSubcategoryClick(subSubcategory)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubSubcategoryClick(subSubcategory)}
                    aria-label={`View ${subSubcategory.name}`}
                  >
                    <div className="relative">
                      <img
                        src={subSubcategory.image || img}
                        alt={subSubcategory.name}
                        className="w-full h-32 object-contain rounded-lg mb-3 transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                      {subSubcategory.name}
                    </h3>
                    {subSubcategory.features?.length > 0 && (
                      <p className="mt-2 text-sm text-gray-500 line-clamp-1">
                        {subSubcategory.features.slice(0, 3).join(', ')}
                        {subSubcategory.features.length > 3 ? '...' : ''}
                      </p>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateEditModal(2, subSubcategory);
                      }}
                      className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                      aria-label={`Edit ${subSubcategory.name}`}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!isLoading && selectedSubSubcategory && !selectedProduct && (
          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">{selectedSubSubcategory.name} Products</h2>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <button
                onClick={() => openProductModal()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
                aria-label="Create new product"
              >
                Create Product
              </button>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Sort products"
              >
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="price-asc">Price (Low to High)</option>
                <option value="price-desc">Price (High to Low)</option>
              </select>
            </div>
            {sortedProducts.length === 0 ? (
              <p className="text-gray-500">No products found.</p>
            ) : (
              <>
                <div ref={productSliderRef} className="flex overflow-x-auto space-x-4 pb-4 scrollbar-hide">
                  {sortedProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onClick={handleProductClick}
                      onEdit={() => openProductModal(product)}
                    />
                  ))}
                </div>
                {totalProductSlides > 1 && (
                  <div className="flex justify-center mt-4 space-x-2">
                    {Array.from({ length: totalProductSlides }).map((_, index) => (
                      <button
                        key={index}
                        className={`w-3 h-3 rounded-full ${productCurrentSlide === index ? 'bg-blue-600' : 'bg-gray-300'}`}
                        onClick={() => goToProductSlide(index)}
                        aria-label={`Go to product slide ${index + 1}`}
                      ></button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!isLoading && selectedProduct && (
          <ProductDetails
            product={selectedProduct}
            onBack={handleBack}
            relatedProducts={getRelatedProducts(selectedProduct)}
            onRelatedProductClick={handleProductClick}
            onEdit={() => openProductModal(selectedProduct)}
          />
        )}

        <CreateSingleCategoryModal
          isOpen={isSingleModalOpen}
          onClose={() => setIsSingleModalOpen(false)}
          onSubmit={
            modalLevel === 'Category'
              ? handleCreateEditCategory
              : modalLevel === 'Subcategory'
              ? handleCreateEditSubcategory
              : handleCreateEditSubSubcategory
          }
          item={editItem}
          categories={categories}
          level={modalLevel === 'Category' ? 0 : modalLevel === 'Subcategory' ? 1 : 2}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
        />

        <BulkCreateCategoryModal
          isOpen={isBulkModalOpen}
          onClose={() => setIsBulkModalOpen(false)}
          onSubmit={
            modalLevel === 'Category'
              ? handleCreateEditCategory
              : modalLevel === 'Subcategory'
              ? handleCreateEditSubcategory
              : handleCreateEditSubSubcategory
          }
          level={modalLevel}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
        />

        <CreateEditProductModal
          isOpen={isProductModalOpen}
          onClose={() => setIsProductModalOpen(false)}
          item={editItem}
          onSubmit={handleCreateEditProduct}
        />
      </div>
    </div>
  );
};

export default ExpenseCategoryPage;