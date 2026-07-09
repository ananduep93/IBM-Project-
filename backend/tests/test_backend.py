import os
from unittest.mock import MagicMock, patch
from app.services.pdf_parser import extract_text_from_pdf

@patch("app.services.pdf_parser.PdfReader")
@patch("os.path.exists")
def test_extract_text_from_pdf(mock_exists, mock_pdf_reader):
    # Mock file existence
    mock_exists.return_value = True
    
    # Mock PDF page extraction
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "Hello, this is a mock PDF text content!"
    
    mock_reader_instance = MagicMock()
    mock_reader_instance.pages = [mock_page]
    mock_pdf_reader.return_value = mock_reader_instance
    
    result = extract_text_from_pdf("dummy_test.pdf")
    
    # Assert result matches mock page text
    assert "Hello, this is a mock PDF text content!" in result
    assert "--- Page 1 ---" in result
    mock_pdf_reader.assert_called_once_with("dummy_test.pdf")

def test_extract_text_from_pdf_not_found():
    # Test error raising when file does not exist
    try:
        extract_text_from_pdf("non_existent_file.pdf")
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        assert True
